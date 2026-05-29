import { useEffect, useState } from "react";
import "./App.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function App() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadHealth() {
      try {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (!response.ok) {
          throw new Error(`Health check failed with ${response.status}`);
        }

        const data = await response.json();
        if (!ignore) {
          setHealth(data);
          setError("");
        }
      } catch (err) {
        if (!ignore) {
          setHealth(null);
          setError(err instanceof Error ? err.message : "Unable to reach backend");
        }
      }
    }

    loadHealth();

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <main className="dashboard">
      <section className="dashboard__header">
        <p className="eyebrow">Manufacturing Data Platform</p>
        <h1>Operations Dashboard</h1>
        <p className="summary">
          MVP foundation for configurable manufacturing data services, APIs, and
          PostgreSQL-backed application data.
        </p>
      </section>

      <section className="status-panel" aria-label="Backend service status">
        <div>
          <p className="panel-label">Backend API</p>
          <h2>{health?.service || "manufacturing-data-platform"}</h2>
        </div>
        <span className={health ? "status-pill status-pill--ok" : "status-pill"}>
          {health ? health.status : "unavailable"}
        </span>
        {error && <p className="error-text">{error}</p>}
      </section>
    </main>
  );
}

export default App;

