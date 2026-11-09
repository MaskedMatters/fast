import "dotenv/config";
import bcrypt from "bcryptjs";
import MongoStore from "connect-mongo";
import express from "express";
import session from "express-session";
import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";
import User from "./models/User.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const mongoUri = process.env.MONGO_URI;
const sessionSecret = process.env.SESSION_SECRET;
const isProduction = process.env.NODE_ENV === "production";
const distPath = fileURLToPath(new URL("../dist", import.meta.url));

if (!mongoUri || !sessionSecret) {
  throw new Error("MONGO_URI and SESSION_SECRET must be set in the environment.");
}

app.use(express.json({ limit: "10kb" }));
app.use(
  session({
    name: "carbon.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: mongoUri, collectionName: "sessions" }),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const usernamePattern = /^[a-zA-Z0-9_-]{3,24}$/;
const maxPasswordBytes = 72;

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

if (isProduction) {
  app.use(express.static(distPath));
  app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
}

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) {
    return next(error);
  }
  return res.status(500).json({ error: "Something went wrong. Please try again." });
});

try {
  await mongoose.connect(mongoUri);
  app.listen(port, () => {
    console.log(`Carbon Labs API listening on http://localhost:${port}`);
  });
} catch (error) {
  console.error("Could not connect to MongoDB:", error);
  process.exitCode = 1;
}
