import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const TOKEN_KEY = "mdp_access_token";

const emptyAttribute = {
  name: "",
  display_name: "",
  data_type: "text",
  required: false,
  description: "",
  is_primary_key: false,
};

const emptyDataModel = {
  name: "",
  display_name: "",
  type: "A",
  category: "",
  description: "",
  business_definition: "",
  owner_department: "",
  source_system: "",
  primary_key: "",
  sensitivity_level: "internal",
  ai_enabled: true,
  attributes: [{ ...emptyAttribute }],
};

function compactPayload(form) {
  const attributes = form.attributes.map((attribute) => ({
    name: attribute.name,
    display_name: attribute.display_name || null,
    data_type: attribute.data_type,
    required: attribute.required,
    description: attribute.description || null,
    is_primary_key: attribute.is_primary_key,
  }));
  const primaryAttribute = attributes.find((attribute) => attribute.is_primary_key);

  return {
    name: form.name,
    display_name: form.display_name,
    type: form.type,
    category: form.category || null,
    description: form.description || null,
    business_definition: form.business_definition || null,
    owner_department: form.owner_department || null,
    source_system: form.source_system || null,
    primary_key: primaryAttribute?.name || form.primary_key || null,
    sensitivity_level: form.sensitivity_level || "internal",
    ai_enabled: form.ai_enabled,
    attributes,
  };
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [currentUser, setCurrentUser] = useState(null);
  const [health, setHealth] = useState(null);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [dataModels, setDataModels] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [expandedTransactionId, setExpandedTransactionId] = useState(null);
  const [browserModels, setBrowserModels] = useState([]);
  const [selectedBrowserModel, setSelectedBrowserModel] = useState("");
  const [browserRecords, setBrowserRecords] = useState([]);
  const [browserLimit, setBrowserLimit] = useState(100);
  const [browserOffset, setBrowserOffset] = useState(0);
  const [browserMessage, setBrowserMessage] = useState("");
  const [form, setForm] = useState(emptyDataModel);
  const [editingId, setEditingId] = useState(null);
  const [modelMessage, setModelMessage] = useState("");
  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }),
    [token],
  );

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

  useEffect(() => {
    if (token && page === "data-models") {
      loadDataModels();
    }
    if (token && page === "transactions") {
      loadTransactions();
    }
    if (token && page === "data-browser") {
      loadBrowserModels();
    }
  }, [page, token]);

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
    setPage("dashboard");
    setError("");
  }

  async function loadDataModels() {
    try {
      const response = await fetch(`${API_BASE_URL}/data-models`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("Unable to load data models");
      }
      setDataModels(await response.json());
    } catch (err) {
      setModelMessage(err instanceof Error ? err.message : "Unable to load data models");
    }
  }

  async function loadTransactions() {
    try {
      const response = await fetch(`${API_BASE_URL}/transactions?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("Unable to load transactions");
      }
      setTransactions(await response.json());
    } catch (err) {
      setModelMessage(err instanceof Error ? err.message : "Unable to load transactions");
    }
  }

  async function loadBrowserModels() {
    try {
      const response = await fetch(`${API_BASE_URL}/data-models?status=active&type=A`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("Unable to load Type A data models");
      }
      const models = await response.json();
      setBrowserModels(models);
      if (!selectedBrowserModel && models.length > 0) {
        setSelectedBrowserModel(models[0].name);
      }
    } catch (err) {
      setBrowserMessage(err instanceof Error ? err.message : "Unable to load models");
    }
  }

  async function loadBrowserRecords(event) {
    event?.preventDefault();
    if (!selectedBrowserModel) {
      setBrowserMessage("Select a data model first.");
      return;
    }
    try {
      const response = await fetch(
        `${API_BASE_URL}/outbound/${selectedBrowserModel}?limit=${browserLimit}&offset=${browserOffset}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || "Unable to load records");
      }
      const data = await response.json();
      setBrowserRecords(data.data);
      setBrowserMessage(`${data.count} records loaded.`);
    } catch (err) {
      setBrowserRecords([]);
      setBrowserMessage(err instanceof Error ? err.message : "Unable to load records");
    }
  }

  function resetForm() {
    setForm({ ...emptyDataModel, attributes: [{ ...emptyAttribute }] });
    setEditingId(null);
    setModelMessage("");
  }

  function editModel(model) {
    setEditingId(model.id);
    setForm({
      ...emptyDataModel,
      ...model,
      attributes: model.attributes.map((attribute) => ({
        ...emptyAttribute,
        ...attribute,
      })),
    });
    setModelMessage("");
  }

  function updateAttribute(index, field, value) {
    setForm((current) => ({
      ...current,
      attributes: current.attributes.map((attribute, attributeIndex) =>
        attributeIndex === index ? { ...attribute, [field]: value } : attribute,
      ),
    }));
  }

  function addAttribute() {
    setForm((current) => ({
      ...current,
      attributes: [...current.attributes, { ...emptyAttribute }],
    }));
  }

  function removeAttribute(index) {
    setForm((current) => ({
      ...current,
      attributes:
        current.attributes.length === 1
          ? current.attributes
          : current.attributes.filter((_, attributeIndex) => attributeIndex !== index),
    }));
  }

  async function saveDataModel(event) {
    event.preventDefault();
    setModelMessage("");
    const method = editingId ? "PUT" : "POST";
    const url = editingId
      ? `${API_BASE_URL}/data-models/${editingId}`
      : `${API_BASE_URL}/data-models`;

    try {
      const response = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify(compactPayload(form)),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail ? JSON.stringify(detail.detail) : "Save failed");
      }

      resetForm();
      await loadDataModels();
      setModelMessage(editingId ? "Data model updated." : "Data model created.");
    } catch (err) {
      setModelMessage(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function deactivateModel(modelId) {
    setModelMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/data-models/${modelId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("Deactivate failed");
      }
      await loadDataModels();
      setModelMessage("Data model deactivated.");
    } catch (err) {
      setModelMessage(err instanceof Error ? err.message : "Deactivate failed");
    }
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
          <h1>
            {page === "dashboard"
              ? "Operations Dashboard"
              : page === "data-models"
                ? "Data Models"
                : page === "data-browser"
                  ? "Data Browser"
                  : "Transactions"}
          </h1>
          <p className="summary">
            Authenticated workspace for configurable manufacturing data services.
          </p>
        </div>
        <div className="top-actions">
          <button type="button" onClick={() => setPage("dashboard")}>
            Dashboard
          </button>
          <button type="button" onClick={() => setPage("data-models")}>
            Data Models
          </button>
          <button type="button" onClick={() => setPage("data-browser")}>
            Data Browser
          </button>
          <button type="button" onClick={() => setPage("transactions")}>
            Transactions
          </button>
          <button className="secondary-button" type="button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </section>

      {page === "dashboard" ? (
        <Dashboard currentUser={currentUser} health={health} />
      ) : page === "data-models" ? (
        <DataModelsPage
          dataModels={dataModels}
          form={form}
          setForm={setForm}
          editingId={editingId}
          modelMessage={modelMessage}
          saveDataModel={saveDataModel}
          resetForm={resetForm}
          editModel={editModel}
          deactivateModel={deactivateModel}
          updateAttribute={updateAttribute}
          addAttribute={addAttribute}
          removeAttribute={removeAttribute}
        />
      ) : page === "data-browser" ? (
        <DataBrowserPage
          models={browserModels}
          selectedModel={selectedBrowserModel}
          setSelectedModel={setSelectedBrowserModel}
          limit={browserLimit}
          setLimit={setBrowserLimit}
          offset={browserOffset}
          setOffset={setBrowserOffset}
          records={browserRecords}
          message={browserMessage}
          loadRecords={loadBrowserRecords}
        />
      ) : (
        <TransactionsPage
          transactions={transactions}
          expandedTransactionId={expandedTransactionId}
          setExpandedTransactionId={setExpandedTransactionId}
        />
      )}
    </main>
  );
}

function Dashboard({ currentUser, health }) {
  return (
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
  );
}

function DataModelsPage({
  dataModels,
  form,
  setForm,
  editingId,
  modelMessage,
  saveDataModel,
  resetForm,
  editModel,
  deactivateModel,
  updateAttribute,
  addAttribute,
  removeAttribute,
}) {
  return (
    <section className="data-model-layout">
      <form className="model-form" onSubmit={saveDataModel}>
        <div className="section-heading">
          <p className="panel-label">{editingId ? "Edit Model" : "Create Model"}</p>
          <button type="button" onClick={resetForm}>
            New
          </button>
        </div>

        <div className="form-grid">
          <label>
            Name
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="invoice"
              required
            />
          </label>
          <label>
            Display Name
            <input
              value={form.display_name}
              onChange={(event) => setForm({ ...form, display_name: event.target.value })}
              placeholder="Invoice"
              required
            />
          </label>
          <label>
            Type
            <select
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value })}
            >
              <option value="A">Type A</option>
              <option value="B">Type B</option>
            </select>
          </label>
          <label>
            Category
            <input
              value={form.category || ""}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              placeholder="finance"
            />
          </label>
          <label>
            Owner Department
            <input
              value={form.owner_department || ""}
              onChange={(event) =>
                setForm({ ...form, owner_department: event.target.value })
              }
              placeholder="Finance"
            />
          </label>
          <label>
            Source System
            <input
              value={form.source_system || ""}
              onChange={(event) => setForm({ ...form, source_system: event.target.value })}
              placeholder="External API"
            />
          </label>
        </div>

        <label>
          Description
          <textarea
            value={form.description || ""}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </label>

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={form.ai_enabled}
            onChange={(event) => setForm({ ...form, ai_enabled: event.target.checked })}
          />
          AI enabled
        </label>

        <p className="helper-text">
          {form.type === "A"
            ? "A PostgreSQL table will be generated automatically for Type A models."
            : "Type B models link to existing/staging tables and do not generate new tables."}
        </p>

        {form.generated_table && (
          <label>
            Generated Table
            <input value={form.generated_table} readOnly />
          </label>
        )}

        <div className="section-heading">
          <p className="panel-label">Attributes</p>
          <button type="button" onClick={addAttribute}>
            Add Attribute
          </button>
        </div>

        <div className="attribute-list">
          {form.attributes.map((attribute, index) => (
            <div className="attribute-row" key={index}>
              <input
                value={attribute.name}
                onChange={(event) => updateAttribute(index, "name", event.target.value)}
                placeholder="invoice_no"
                required
              />
              <input
                value={attribute.display_name || ""}
                onChange={(event) =>
                  updateAttribute(index, "display_name", event.target.value)
                }
                placeholder="Invoice Number"
              />
              <select
                value={attribute.data_type}
                onChange={(event) => updateAttribute(index, "data_type", event.target.value)}
              >
                <option value="text">text</option>
                <option value="integer">integer</option>
                <option value="float">float</option>
                <option value="boolean">boolean</option>
                <option value="date">date</option>
                <option value="datetime">datetime</option>
                <option value="json">json</option>
              </select>
              <label className="compact-check">
                <input
                  type="checkbox"
                  checked={attribute.required}
                  onChange={(event) =>
                    updateAttribute(index, "required", event.target.checked)
                  }
                />
                Required
              </label>
              <label className="compact-check">
                <input
                  type="checkbox"
                  checked={attribute.is_primary_key}
                  onChange={(event) =>
                    updateAttribute(index, "is_primary_key", event.target.checked)
                  }
                />
                PK
              </label>
              <textarea
                value={attribute.description || ""}
                onChange={(event) =>
                  updateAttribute(index, "description", event.target.value)
                }
                placeholder="Description"
              />
              <button type="button" onClick={() => removeAttribute(index)}>
                Remove
              </button>
            </div>
          ))}
        </div>

        <button className="primary-button" type="submit">
          {editingId ? "Update Data Model" : "Create Data Model"}
        </button>
        {modelMessage && <p className="form-message">{modelMessage}</p>}
      </form>

      <section className="model-list">
        {dataModels.map((model) => (
          <article className="model-item" key={model.id}>
            <div>
              <p className="panel-label">
                Type {model.type} · {model.status}
              </p>
              <h2>{model.display_name}</h2>
              <p>{model.description || model.name}</p>
              {model.generated_table && (
                <p className="table-name">{model.generated_table}</p>
              )}
              {model.type === "A" && (
                <p className="table-name">POST /inbound/{model.name}</p>
              )}
            </div>
            <div className="item-actions">
              <button type="button" onClick={() => editModel(model)}>
                Edit
              </button>
              <button
                type="button"
                onClick={() => deactivateModel(model.id)}
                disabled={model.status === "inactive"}
              >
                Deactivate
              </button>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}

function TransactionsPage({
  transactions,
  expandedTransactionId,
  setExpandedTransactionId,
}) {
  return (
    <section className="transactions-panel">
      <div className="table-header">
        <span>Created</span>
        <span>Direction</span>
        <span>Protocol</span>
        <span>Endpoint</span>
        <span>Status</span>
      </div>
      {transactions.map((transaction) => (
        <article className="transaction-row" key={transaction.id}>
          <button
            type="button"
            onClick={() =>
              setExpandedTransactionId(
                expandedTransactionId === transaction.id ? null : transaction.id,
              )
            }
          >
            <span>{new Date(transaction.created_at).toLocaleString()}</span>
            <span>{transaction.direction}</span>
            <span>{transaction.protocol}</span>
            <span>{transaction.endpoint || "-"}</span>
            <span>{transaction.status}</span>
          </button>
          <div className="transaction-meta">
            <span>{transaction.data_model_id || "-"}</span>
            <span>{transaction.error_message || ""}</span>
          </div>
          {expandedTransactionId === transaction.id && (
            <pre>
              {JSON.stringify(
                {
                  request_payload: transaction.request_payload,
                  response_payload: transaction.response_payload,
                  error_message: transaction.error_message,
                },
                null,
                2,
              )}
            </pre>
          )}
        </article>
      ))}
    </section>
  );
}

function DataBrowserPage({
  models,
  selectedModel,
  setSelectedModel,
  limit,
  setLimit,
  offset,
  setOffset,
  records,
  message,
  loadRecords,
}) {
  const selected = models.find((model) => model.name === selectedModel);
  const fields = records.length > 0 ? Object.keys(records[0]) : [];

  return (
    <section className="browser-panel">
      <form className="browser-controls" onSubmit={loadRecords}>
        <label>
          Data Model
          <select
            value={selectedModel}
            onChange={(event) => setSelectedModel(event.target.value)}
          >
            {models.map((model) => (
              <option key={model.id} value={model.name}>
                {model.display_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Limit
          <input
            type="number"
            min="1"
            max="500"
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
          />
        </label>
        <label>
          Offset
          <input
            type="number"
            min="0"
            value={offset}
            onChange={(event) => setOffset(Number(event.target.value))}
          />
        </label>
        <button type="submit">Load Records</button>
      </form>

      {selected && (
        <div className="browser-endpoints">
          <p className="table-name">GET /outbound/{selected.name}</p>
          <p className="table-name">
            GET /outbound/{selected.name}/{selected.primary_key || "primary_key_value"}
          </p>
        </div>
      )}

      {message && <p className="form-message">{message}</p>}

      <div className="browser-results">
        {records.length > 0 ? (
          <table>
            <thead>
              <tr>
                {fields.map((field) => (
                  <th key={field}>{field}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((record, index) => (
                <tr key={index}>
                  {fields.map((field) => (
                    <td key={field}>{JSON.stringify(record[field])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <pre>[]</pre>
        )}
      </div>
    </section>
  );
}

export default App;
