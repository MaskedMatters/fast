import "dotenv/config";
import bcrypt from "bcryptjs";
import cookieSignature from "cookie-signature";
import MongoStore from "connect-mongo";
import Docker from "dockerode";
import express from "express";
import http from "node:http";
import session from "express-session";
import httpProxy from "http-proxy";
import mongoose from "mongoose";
import User from "./models/User.js";
import { WorkspaceManager } from "./workspace.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const bindAddress = process.env.BIND_ADDRESS ?? "0.0.0.0";
const mongoUri = process.env.MONGO_URI;
const sessionSecret = process.env.SESSION_SECRET;
const isProduction = process.env.NODE_ENV === "production";
const dockerAddress = process.env.DOCKER_HOST ?? "unix:///var/run/docker.sock";
if (!mongoUri || !sessionSecret) {
  throw new Error("MONGO_URI and SESSION_SECRET must be set in the environment.");
}

const docker = new Docker({
  socketPath: dockerAddress.replace(/^unix:\/\//, ""),
});
const workspaceManager = new WorkspaceManager({
  docker,
  image: process.env.CHROMIUM_IMAGE ?? "lscr.io/linuxserver/chromium:latest",
  proxyHost: process.env.DOCKER_PROXY_HOST ?? "127.0.0.1",
});
const sessionStore = MongoStore.create({
  mongoUrl: mongoUri,
  collectionName: "sessions",
});
const containerProxy = httpProxy.createProxyServer({
  changeOrigin: true,
  ws: true,
  xfwd: true,
});

app.use(express.json({ limit: "10kb" }));
if (isProduction) {
  app.set("trust proxy", 1);
}
app.use(
  session({
    name: "carbon.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction ? "auto" : false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const usernamePattern = /^[a-zA-Z0-9_-]{3,24}$/;
const maxPasswordBytes = 72;

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  return next();
}

app.get("/api/healthz", (req, res) => res.json({ ok: true }));

app.post(
  "/api/auth/signup",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const confirmPassword =
      typeof body.confirmPassword === "string" ? body.confirmPassword : "";

    if (!usernamePattern.test(username)) {
      return res.status(400).json({
        error: "Username must be 3–24 characters and use only letters, numbers, underscores, or hyphens.",
      });
    }
    const passwordBytes = Buffer.byteLength(password, "utf8");
    if (passwordBytes < 8 || passwordBytes > maxPasswordBytes) {
      return res.status(400).json({ error: "Password must be between 8 and 72 bytes." });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match." });
    }

    const usernameNormalized = username.toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);

    let user;
    try {
      user = await User.create({ username, usernameNormalized, passwordHash });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ error: "That username is already taken." });
      }
      throw error;
    }

    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => (error ? reject(error) : resolve()));
    });
    req.session.userId = user.id;
    await new Promise((resolve, reject) => {
      req.session.save((error) => (error ? reject(error) : resolve()));
    });

    return res.status(201).json({ user: { username: user.username } });
  }),
);

app.post(
  "/api/auth/login",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const user = await User.findOne({ usernameNormalized: username.toLowerCase() });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "The username or password is incorrect." });
    }

    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => (error ? reject(error) : resolve()));
    });
    req.session.userId = user.id;
    await new Promise((resolve, reject) => {
      req.session.save((error) => (error ? reject(error) : resolve()));
    });

    return res.json({ user: { username: user.username } });
  }),
);

app.get(
  "/api/auth/me",
  asyncHandler(async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated." });
    }

    const user = await User.findById(req.session.userId).select("username");
    if (!user) {
      return res.status(401).json({ error: "Not authenticated." });
    }

    return res.json({ user: { username: user.username } });
  }),
);

app.post(
  "/api/auth/logout",
  asyncHandler(async (req, res) => {
    await new Promise((resolve, reject) => {
      req.session.destroy((error) => (error ? reject(error) : resolve()));
    });
    res.clearCookie("carbon.sid", { httpOnly: true, sameSite: "lax", secure: isProduction });
    return res.status(204).end();
  }),
);

app.get(
  "/api/workspace",
  requireAuth,
  asyncHandler(async (req, res) => {
    return res.json(await workspaceManager.getSnapshot(req.session.userId));
  }),
);

app.post(
  "/api/workspace/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const workspace = await workspaceManager.start(req.session.userId);
    return res.json({ workspace });
  }),
);

app.post(
  "/api/workspace/presence",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (typeof req.body?.active !== "boolean") {
      return res.status(400).json({ error: "Presence must be true or false." });
    }
    const workspace = await workspaceManager.setPresence(
      req.session.userId,
      req.body.active,
    );
    return res.json({ workspace });
  }),
);

app.post(
  "/api/workspace/stop",
  requireAuth,
  asyncHandler(async (req, res) => {
    const workspace = await workspaceManager.stop(req.session.userId);
    return res.json({ workspace });
  }),
);

app.post(
  "/api/workspace/reset",
  requireAuth,
  asyncHandler(async (req, res) => {
    const workspace = await workspaceManager.reset(req.session.userId);
    return res.json({ workspace });
  }),
);

app.use(
  "/session",
  requireAuth,
  asyncHandler(async (req, res) => {
    const target = await workspaceManager.getProxyTarget(req.session.userId);
    if (!target) {
      return res.status(409).send("Start or rejoin your Chromium session first.");
    }
    containerProxy.web(req, res, { target }, (error) => {
      console.error("Could not proxy Chromium request:", error);
      if (!res.headersSent) {
        res.status(502).send("The Chromium session is temporarily unavailable.");
      } else {
        res.destroy(error);
      }
    });
  }),
);

function rejectUpgrade(socket, status = 401) {
  const reason = {
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
  }[status] ?? "Error";
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
}

function getSessionIdFromCookie(request) {
  const cookieHeader = request.headers.cookie ?? "";
  const sessionCookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("carbon.sid="))
    ?.slice("carbon.sid=".length);

  if (!sessionCookie) {
    return null;
  }
  let decodedCookie;
  try {
    decodedCookie = decodeURIComponent(sessionCookie);
  } catch {
    return null;
  }
  if (!decodedCookie.startsWith("s:")) {
    return null;
  }
  return cookieSignature.unsign(decodedCookie.slice(2), sessionSecret);
}

function hasSameOrigin(request) {
  const origin = request.headers.origin;
  const protocol = request.headers["x-forwarded-proto"] ?? "http";
  if (!origin || !request.headers.host) {
    return false;
  }
  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.origin === `${protocol}://${request.headers.host}`;
  } catch {
    return false;
  }
}

const server = http.createServer(app);
server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/session" && !req.url?.startsWith("/session/")) {
    rejectUpgrade(socket, 404);
    return;
  }

  if (!hasSameOrigin(req)) {
    rejectUpgrade(socket, 403);
    return;
  }

  const sessionId = getSessionIdFromCookie(req);
  if (!sessionId) {
    rejectUpgrade(socket);
    return;
  }

  sessionStore.get(sessionId, async (error, storedSession) => {
    if (error || !storedSession?.userId) {
      if (error) console.error("Could not load WebSocket session:", error);
      rejectUpgrade(socket);
      return;
    }

    try {
      const target = await workspaceManager.getProxyTarget(storedSession.userId);
      if (!target) {
        rejectUpgrade(socket, 404);
        return;
      }
      const parsedUrl = new URL(req.url, "http://localhost");
      parsedUrl.pathname = parsedUrl.pathname.slice("/session".length) || "/";
      req.url = `${parsedUrl.pathname}${parsedUrl.search}`;
      containerProxy.ws(req, socket, head, { target }, (proxyError) => {
        console.error("Could not proxy Chromium WebSocket:", proxyError);
        socket.destroy();
      });
    } catch (proxyError) {
      console.error("Could not establish Chromium WebSocket:", proxyError);
      rejectUpgrade(socket, 404);
    }
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) {
    return next(error);
  }
  const status =
    Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 500
      ? error.statusCode
      : 500;
  return res.status(status).json({
    error:
      error?.userMessage ??
      (status < 500 ? error.message : "Something went wrong. Please try again."),
  });
});

try {
  await mongoose.connect(mongoUri);
  server.listen(port, bindAddress, () => {
    console.log(`Carbon Labs API listening on http://localhost:${port}`);
  });
} catch (error) {
  console.error("Could not connect to MongoDB:", error);
  process.exitCode = 1;
}
