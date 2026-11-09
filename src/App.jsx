import React, { useEffect, useState } from "react";

async function requestApi(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const result = response.status === 204 ? {} : await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Something went wrong. Please try again.");
  }
  return result;
}

function BrandMark() {
  return (
    <div className="brand" aria-label="Carbon Labs">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="brand-name">carbon labs</span>
    </div>
  );
}

function WelcomePanel() {
  return (
    <section className="welcome-panel" aria-labelledby="welcome-heading">
      <div className="welcome-copy">
        <div className="eyebrow">
          <span className="eyebrow-line" />
          A BETTER WAY FORWARD
        </div>
        <h1 id="welcome-heading">
          Welcome to
          <br />
          <span className="title-highlight">Carbon Labs</span>
          <span className="title-period">.</span>
        </h1>
        <p className="welcome-description">
          Carbon Labs is an interdisciplinary research community advancing
          sustainable materials through rigorous inquiry and collaboration. We
          bring researchers together to turn evidence into lasting impact.
        </p>
        <div className="welcome-footnote">
          Research <span>·</span> Collaboration <span>·</span> Discovery
        </div>
      </div>
    </section>
  );
}

function AuthCard({ mode, onAuthenticated, onNavigate, message, setMessage }) {
  const isSignup = mode === "signup";
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const username = formData.get("username");
    const password = formData.get("password");
    const confirmPassword = formData.get("confirmPassword");

    if (isSignup && password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/auth/${isSignup ? "signup" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, confirmPassword }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to authenticate. Please try again.");
      }

      onAuthenticated(result.user);
    } catch (error) {
      setMessage(error.message || "Unable to connect. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="login-card" aria-labelledby="login-heading">
      <div className="card-kicker">
        <span className="kicker-dot" />
        {isSignup ? "START YOUR JOURNEY" : "YOUR WORKSPACE AWAITS"}
      </div>
      <h2 id="login-heading">
        {isSignup ? "Sign up" : "Log in"}
        <span>.</span>
      </h2>
      <p className="card-description">
        {isSignup ? "Create your Carbon Labs account." : "Good to have you back."}
      </p>

      <form className="login-form" onSubmit={handleSubmit}>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          name="username"
          type="text"
          placeholder="Your username"
          autoComplete="username"
          minLength={3}
          maxLength={24}
          pattern="[A-Za-z0-9_-]{3,24}"
          title="Use 3–24 letters, numbers, underscores, or hyphens."
          required
        />

        <div className="password-label">
          <label htmlFor="password">Password</label>
          {isSignup && <span>At least 8 characters</span>}
        </div>
        <input
          id="password"
          name="password"
          type="password"
          placeholder={isSignup ? "Create a password" : "Enter your password"}
          autoComplete={isSignup ? "new-password" : "current-password"}
          minLength={8}
          required
        />

        {isSignup && (
          <>
            <label className="confirm-password-label" htmlFor="confirmPassword">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="Enter your password again"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </>
        )}

        {message && (
          <p className="form-message" role="alert">
            {message}
          </p>
        )}

        <button className="submit-button" type="submit" disabled={isSubmitting}>
          <span>
            {isSubmitting
              ? "Please wait..."
              : isSignup
                ? "Create your account"
                : "Log in to your account"}
          </span>
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M4.5 10h11m0 0-4.5-4.5M15.5 10 11 14.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>

      <div className="divider" aria-label="or">
        <span />
        <span className="divider-word">or</span>
        <span />
      </div>
      <p className="signup-prompt">
        {isSignup ? "Already have an account? " : "New around here? "}
        <a
          href={isSignup ? "/" : "/signup"}
          onClick={(event) => onNavigate(event, isSignup ? "/" : "/signup")}
        >
          {isSignup ? "Log in" : "Continue to sign up"}
        </a>
      </p>
    </section>
  );
}

function Dashboard({ user }) {
  const [snapshot, setSnapshot] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [isViewing, setIsViewing] = useState(false);
  const [frameVersion, setFrameVersion] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    const loadWorkspace = async () => {
      try {
        const result = await requestApi("/api/workspace");
        if (active) {
          setSnapshot(result);
          setErrorMessage("");
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error.message || "Unable to load your workspace.");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    loadWorkspace();
    const intervalId = window.setInterval(loadWorkspace, 15_000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!isViewing) return undefined;

    const sendPresence = (active) => {
      requestApi("/api/workspace/presence", {
        method: "POST",
        body: JSON.stringify({ active }),
      }).catch((error) => {
        setErrorMessage(error.message || "Unable to update your session status.");
      });
    };
    const syncVisibility = () => {
      sendPresence(document.visibilityState === "visible");
    };

    syncVisibility();
    const intervalId = window.setInterval(syncVisibility, 20_000);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, [isViewing]);

  async function leaveBrowser() {
    setIsViewing(false);
    try {
      await requestApi("/api/workspace/presence", {
        method: "POST",
        body: JSON.stringify({ active: false }),
      });
    } catch (error) {
      setErrorMessage(error.message || "Unable to update your session status.");
    }
  }

  async function runWorkspaceAction(action, { enter = false } = {}) {
    setBusyAction(action);
    setErrorMessage("");
    try {
      const result = await requestApi(`/api/workspace/${action}`, {
        method: "POST",
      });
      setSnapshot((current) => ({
        ...current,
        workspace: result.workspace,
      }));
      if (enter) setIsViewing(true);
      if (action === "stop" || action === "reset") setIsViewing(false);
    } catch (error) {
      setErrorMessage(error.message || "Unable to update your workspace.");
    } finally {
      setBusyAction("");
    }
  }

  const workspace = snapshot?.workspace;
  const isRunning = workspace?.status === "running";
  const isStarting = workspace?.status === "starting";

  return (
    <section className="dashboard-main" aria-labelledby="dashboard-heading">
      <div className="dashboard-content">
        <div className="dashboard-intro">
          <div className="dashboard-heading-copy">
            <div className="card-kicker">
              <span className="kicker-dot" />
              YOUR PRIVATE WORKSPACE
            </div>
            <h1 id="dashboard-heading">
              Hello <span className="title-highlight">{user.username}</span>
              <span className="title-period">.</span>
            </h1>
            <p className="dashboard-subtitle">
              Your own browser, ready whenever you are.
            </p>
          </div>
          <div className="active-users" aria-live="polite">
            <span className="active-users-icon" aria-hidden="true">
              <span />
            </span>
            <div>
              <strong>{snapshot?.activeUsers ?? "—"}</strong>
              <span>using their browser now</span>
            </div>
          </div>
        </div>

        {errorMessage && (
          <p className="dashboard-error" role="alert">
            {errorMessage}
          </p>
        )}

        {isViewing && isRunning ? (
          <section className="browser-session" aria-label="Chromium session">
            <div className="session-toolbar">
              <div className="session-connection">
                <span className="connection-indicator" />
                <span>Private browser</span>
              </div>
              <div className="session-actions">
                <button
                  className="session-toolbar-button"
                  type="button"
                  onClick={() => setFrameVersion((version) => version + 1)}
                  aria-label="Refresh browser"
                  title="Refresh browser"
                >
                  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path
                      d="M16 8a6 6 0 0 0-10.4-2L4 7.5M4 4v3.5h3.5M4 12a6 6 0 0 0 10.4 2L16 12.5M16 16v-3.5h-3.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>Refresh</span>
                </button>
                <button
                  className="session-toolbar-button"
                  type="button"
                  onClick={leaveBrowser}
                >
                  Exit browser
                </button>
              </div>
            </div>
            <iframe
              key={frameVersion}
              className="browser-frame"
              src="/session/"
              title="Your Chromium browser"
              allow="clipboard-read; clipboard-write; fullscreen"
              allowFullScreen
            />
          </section>
        ) : (
          <section className="workspace-card" aria-labelledby="workspace-title">
            <div className="workspace-card-copy">
              <div className="workspace-icon" aria-hidden="true">
                <svg viewBox="0 0 32 32" fill="none">
                  <rect
                    x="4.5"
                    y="6.5"
                    width="23"
                    height="19"
                    rx="2.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M5 11h22M9 8.8h.1m3.3 0h.1m3.3 0h.1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="m12 16 3 2.5-3 2.5m5 0h4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <div className="workspace-status">
                  <span className={isRunning ? "status-dot is-running" : "status-dot"} />
                  {isLoading
                    ? "Checking your workspace"
                    : isRunning
                      ? "Browser is ready"
                      : isStarting
                        ? "Starting your browser"
                      : workspace?.hasSavedData
                        ? "Saved browser profile"
                        : "No active session"}
                </div>
                <h2 id="workspace-title">
                  {isRunning
                    ? "Your browser is waiting"
                    : isStarting
                      ? "Your browser is starting"
                    : workspace?.hasSavedData
                      ? "Pick up where you left off"
                      : "A browser of your own"}
                </h2>
                <p>
                  {isRunning
                    ? "Your private Chromium session is running. Rejoin it or stop it when you are done."
                    : isStarting
                      ? "Your private Chromium session is getting ready. This can take a moment."
                    : workspace?.hasSavedData
                      ? "Your container is stopped, but your browser profile and files are saved."
                      : "Start a private Chromium session. Your profile and files will be saved between visits."}
                </p>
              </div>
            </div>

            <div className="workspace-controls">
              <button
                className="submit-button workspace-primary-button"
                type="button"
                disabled={Boolean(busyAction) || isLoading || isStarting}
                onClick={() =>
                  runWorkspaceAction("start", { enter: true })
                }
              >
                <span>
                  {busyAction === "start"
                    ? "Starting your browser..."
                    : isStarting
                      ? "Starting your browser..."
                    : isRunning
                      ? "Rejoin session"
                      : workspace?.hasSavedData
                        ? "Resume saved session"
                        : "Start a session"}
                </span>
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M4.5 10h11m0 0-4.5-4.5M15.5 10 11 14.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {workspace?.hasSavedData && (
                <button
                  className="quiet-button"
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Reset your browser profile? This permanently deletes saved browser data and files.",
                      )
                    ) {
                      runWorkspaceAction("reset");
                    }
                  }}
                >
                  {busyAction === "reset" ? "Resetting..." : "Reset profile"}
                </button>
              )}
              {isRunning && (
                <button
                  className="quiet-button stop-button"
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() => runWorkspaceAction("stop")}
                >
                  {busyAction === "stop" ? "Stopping..." : "Stop session"}
                </button>
              )}
            </div>
          </section>
        )}

        <section className="community-card" aria-label="Community">
          <div className="community-mark" aria-hidden="true">✳</div>
          <div>
            <h2>A little more room to connect</h2>
            <p>We’re saving a spot for the community features coming next.</p>
          </div>
          <span className="coming-soon">COMING SOON</span>
        </section>
      </div>
    </section>
  );
}

export default function App() {
  const [route, setRoute] = useState(window.location.pathname);
  const [user, setUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [message, setMessage] = useState("");

  function navigate(event, nextRoute, replace = false) {
    event?.preventDefault();
    window.history[replace ? "replaceState" : "pushState"]({}, "", nextRoute);
    setRoute(nextRoute);
    setMessage("");
  }

  useEffect(() => {
    const handlePopState = () => {
      setRoute(window.location.pathname);
      setMessage("");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    document.title =
      route === "/signup"
        ? "Carbon Labs — Sign up"
        : route === "/dashboard"
          ? "Carbon Labs — Dashboard"
          : "Carbon Labs — Log in";
  }, [route]);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then(async (response) => {
        if (response.status === 401) {
          return null;
        }
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Unable to check your session.");
        }
        return result.user;
      })
      .then((authenticatedUser) => {
        if (!active) return;
        setUser(authenticatedUser);
        if (authenticatedUser && window.location.pathname !== "/dashboard") {
          navigate(null, "/dashboard", true);
        } else if (!authenticatedUser && window.location.pathname === "/dashboard") {
          navigate(null, "/", true);
        }
      })
      .catch((error) => {
        if (active) {
          setMessage(error.message || "Unable to connect to the server.");
        }
      })
      .finally(() => {
        if (active) setIsCheckingAuth(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    setMessage("");
    try {
      try {
        await requestApi("/api/workspace/presence", {
          method: "POST",
          body: JSON.stringify({ active: false }),
        });
      } catch (error) {
        console.error("Could not clear workspace presence before logout:", error);
      }
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        throw new Error("Unable to log out. Please try again.");
      }
      setUser(null);
      navigate(null, "/");
    } catch (error) {
      setMessage(error.message || "Unable to connect to the server.");
    }
  }

  const isSignup = route === "/signup";
  const showDashboard = Boolean(user) && route === "/dashboard";

  return (
    <main
      className={`page-shell ${isSignup ? "signup-page" : ""} ${showDashboard ? "dashboard-page" : ""}`}
    >
      <header className="topbar">
        <BrandMark />
        {showDashboard ? (
          <button className="text-button" type="button" onClick={handleLogout}>
            Log out
          </button>
        ) : (
          <span className="topbar-note">
            Thoughtfully built for what comes next <span>↗</span>
          </span>
        )}
      </header>

      {isCheckingAuth ? (
        <div className="auth-loading" role="status">
          Preparing your workspace...
        </div>
      ) : showDashboard ? (
        <Dashboard key={user.username} user={user} />
      ) : (
        <div className="main-layout">
          <WelcomePanel />
          <div className="vertical-divider" aria-hidden="true">
            <span />
          </div>
          <div className="form-panel">
            <AuthCard
              mode={isSignup ? "signup" : "login"}
              onAuthenticated={(authenticatedUser) => {
                setUser(authenticatedUser);
                navigate(null, "/dashboard");
              }}
              onNavigate={navigate}
              message={message}
              setMessage={setMessage}
            />
            <p className="legal-note">
              By continuing, you agree to our <a href="#terms">Terms</a> and{" "}
              <a href="#privacy">Privacy Policy</a>.
            </p>
          </div>
        </div>
      )}

      <footer className="footer">
        <span>© 2025 Carbon Labs</span>
        <span className="footer-status">
          <span /> GOOD THINGS ARE GROWING
        </span>
      </footer>
    </main>
  );
}
