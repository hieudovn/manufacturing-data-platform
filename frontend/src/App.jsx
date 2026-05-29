import { useEffect, useState } from "react";
import "./App.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const TOKEN_KEY = "mdp_access_token";

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [currentUser, setCurrentUser] = useState(null);
  const [health, setHealth] = useState(null);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function loadHealth() {
      try {
        const response = await fetch(`${API_BASE_URL}/health`);
        setHealth(response.ok ? await response.json() : null);
      } catch {
        setHealth(null);
      }
    }

    loadHealth();
  }, []);

  useEffect(() => {
    if (!token) {
      setCurrentUser(null);
      return;
    }

    let ignore = false;

    async function loadCurrentUser() {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error("Session expired. Please log in again.");
        }

        const data = await response.json();
        if (!ignore) {
          setCurrentUser(data);
          setError("");
        }
      } catch (err) {
        if (!ignore) {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setCurrentUser(null);
          setError(err instanceof Error ? err.message : "Unable to load user");
        }
      }
    }

    loadCurrentUser();

    return () => {
      ignore = true;
    };
  }, [token]);

  async function handleLogin(event) {
    event.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        throw new Error("Invalid username or password");
      }

      const data = await response.json();
      localStorage.setItem(TOKEN_KEY, data.access_token);
      setToken(data.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setCurrentUser(null);
    setError("");
  }

  if (!token) {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <p className="eyebrow">Manufacturing Data Platform</p>
          <h1>Sign in</h1>
          <form className="login-form" onSubmit={handleLogin}>
            <label>
              Username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button type="submit" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign in"}
            </button>
            {error && <p className="error-text">{error}</p>}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <section className="dashboard__header">
        <div>
          <p className="eyebrow">Manufacturing Data Platform</p>
          <h1>Operations Dashboard</h1>
          <p className="summary">
            Authenticated workspace for configurable manufacturing data services.
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={handleLogout}>
          Logout
        </button>
      </section>

      <section className="panel-grid">
        <article className="status-panel" aria-label="Current user">
          <p className="panel-label">Current User</p>
          <h2>{currentUser?.full_name || currentUser?.username || "Loading..."}</h2>
          <dl>
            <div>
              <dt>Email</dt>
              <dd>{currentUser?.email || "-"}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{currentUser?.role || "-"}</dd>
            </div>
          </dl>
        </article>

        <article className="status-panel" aria-label="Backend service status">
          <p className="panel-label">Backend API</p>
          <h2>{health?.service || "manufacturing-data-platform"}</h2>
          <span className={health ? "status-pill status-pill--ok" : "status-pill"}>
            {health ? health.status : "unavailable"}
          </span>
        </article>
      </section>
    </main>
  );
}

export default App;
