import React, { useEffect, useState } from "react";

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
    <main className={`page-shell ${isSignup ? "signup-page" : ""}`}>
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
        <section className="dashboard-main" aria-labelledby="dashboard-heading">
          <div className="dashboard-card">
            <div className="card-kicker">
              <span className="kicker-dot" />
              YOUR WORKSPACE
            </div>
            <h1 id="dashboard-heading">
              Hello <span className="title-highlight">{user.username}</span>
              <span className="title-period">.</span>
            </h1>
            <p className="card-description">Your Carbon Labs workspace is ready.</p>
            {message && (
              <p className="form-message" role="alert">
                {message}
              </p>
            )}
          </div>
        </section>
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
