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
  source_schema: "",
  source_table: "",
  source_column: "",
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

const dataTypeOptions = ["text", "integer", "float", "boolean", "date", "datetime", "json"];
const reservedSourceAttributeNames = {
  id: "source_id",
  raw_payload: "source_raw_payload",
  created_at: "source_created_at",
  updated_at: "source_updated_at",
};

function attributeNameFromSourceColumn(columnName = "") {
  return reservedSourceAttributeNames[columnName] || columnName;
}

function displayNameFromAttributeName(attributeName = "") {
  return attributeName
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferPlatformType(sourceType = "") {
  const normalized = sourceType.toLowerCase();
  if (
    normalized.startsWith("character varying") ||
    normalized.startsWith("varchar") ||
    normalized.startsWith("char") ||
    normalized === "text"
  ) {
    return "text";
  }
  if (["integer", "bigint", "smallint"].some((typeName) => normalized.startsWith(typeName))) {
    return "integer";
  }
  if (
    ["numeric", "double precision", "real", "decimal"].some((typeName) =>
      normalized.startsWith(typeName),
    )
  ) {
    return "float";
  }
  if (normalized.startsWith("boolean")) {
    return "boolean";
  }
  if (normalized === "date") {
    return "date";
  }
  if (normalized.startsWith("timestamp")) {
    return "datetime";
  }
  if (normalized === "json" || normalized === "jsonb") {
    return "json";
  }
  return "text";
}

function formatApiDetail(detail) {
  if (Array.isArray(detail)) {
    return detail
      .map((item) => `${item.field || item.loc?.join(".") || "error"}: ${item.message || item.msg || JSON.stringify(item)}`)
      .join("\n");
  }
  if (typeof detail === "string") {
    return detail;
  }
  if (detail) {
    return JSON.stringify(detail);
  }
  return "Request failed";
}

const emptyConnection = {
  name: "",
  type: "postgresql",
  description: "",
  host: "",
  port: 5432,
  database_name: "",
  username: "",
  password: "",
  base_url: "",
  mqtt_topic_prefix: "",
  config: "{}",
  status: "active",
};

function compactPayload(form) {
  const attributes = form.attributes.map((attribute) => ({
    name: attribute.name,
    display_name: attribute.display_name || null,
    data_type: attribute.data_type,
    required: attribute.required,
    description: attribute.description || null,
    source_schema: form.type === "B" ? attribute.source_schema || null : null,
    source_table: form.type === "B" ? attribute.source_table || null : null,
    source_column: form.type === "B" ? attribute.source_column || null : null,
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
  const [apiKeys, setApiKeys] = useState([]);
  const [apiKeyForm, setApiKeyForm] = useState({
    name: "",
    description: "",
    source_system: "",
    allowed_directions: ["inbound", "outbound"],
    allowed_models: "",
    expires_at: "",
    is_active: true,
  });
  const [editingApiKeyId, setEditingApiKeyId] = useState(null);
  const [createdPlainApiKey, setCreatedPlainApiKey] = useState("");
  const [apiKeyMessage, setApiKeyMessage] = useState("");
  const [connections, setConnections] = useState([]);
  const [connectionForm, setConnectionForm] = useState(emptyConnection);
  const [editingConnectionId, setEditingConnectionId] = useState(null);
  const [connectionMessage, setConnectionMessage] = useState("");
  const [demoCounts, setDemoCounts] = useState(null);
  const [demoMessage, setDemoMessage] = useState("");
  const [dbSchemas, setDbSchemas] = useState([]);
  const [selectedDbSchema, setSelectedDbSchema] = useState("");
  const [dbTables, setDbTables] = useState([]);
  const [selectedDbTable, setSelectedDbTable] = useState("");
  const [dbColumns, setDbColumns] = useState([]);
  const [dbPreview, setDbPreview] = useState({ columns: [], rows: [] });
  const [dbBrowserMessage, setDbBrowserMessage] = useState("");
  const [dbBrowserLoading, setDbBrowserLoading] = useState(false);
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
    if (token && page === "api-keys") {
      loadApiKeys();
    }
    if (token && page === "connections") {
      loadConnections();
    }
    if (token && page === "demo-data") {
      loadDemoSummary();
    }
    if (token && page === "db-browser") {
      loadDbSchemas();
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

  async function loadApiKeys() {
    try {
      const response = await fetch(`${API_BASE_URL}/api-keys`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("Unable to load API keys");
      }
      setApiKeys(await response.json());
    } catch (err) {
      setApiKeyMessage(err instanceof Error ? err.message : "Unable to load API keys");
    }
  }

  function resetApiKeyForm() {
    setEditingApiKeyId(null);
    setApiKeyForm({
      name: "",
      description: "",
      source_system: "",
      allowed_directions: ["inbound", "outbound"],
      allowed_models: "",
      expires_at: "",
      is_active: true,
    });
  }

  function editApiKey(apiKey) {
    setEditingApiKeyId(apiKey.id);
    setCreatedPlainApiKey("");
    setApiKeyForm({
      name: apiKey.name,
      description: apiKey.description || "",
      source_system: apiKey.source_system || "",
      allowed_directions: apiKey.allowed_directions,
      allowed_models: apiKey.allowed_models?.join(", ") || "",
      expires_at: apiKey.expires_at ? apiKey.expires_at.slice(0, 16) : "",
      is_active: apiKey.is_active,
    });
  }

  async function saveApiKey(event) {
    event.preventDefault();
    setApiKeyMessage("");
    setCreatedPlainApiKey("");
    const payload = {
      name: apiKeyForm.name,
      description: apiKeyForm.description || null,
      source_system: apiKeyForm.source_system || null,
      allowed_directions: apiKeyForm.allowed_directions,
      allowed_models: apiKeyForm.allowed_models
        ? apiKeyForm.allowed_models.split(",").map((item) => item.trim()).filter(Boolean)
        : null,
      expires_at: apiKeyForm.expires_at ? new Date(apiKeyForm.expires_at).toISOString() : null,
      is_active: apiKeyForm.is_active,
    };
    const url = editingApiKeyId
      ? `${API_BASE_URL}/api-keys/${editingApiKeyId}`
      : `${API_BASE_URL}/api-keys`;
    const method = editingApiKeyId ? "PUT" : "POST";
    try {
      const response = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("Unable to save API key");
      }
      const data = await response.json();
      if (data.api_key) {
        setCreatedPlainApiKey(data.api_key);
      }
      resetApiKeyForm();
      await loadApiKeys();
      setApiKeyMessage(editingApiKeyId ? "API key updated." : "API key created.");
    } catch (err) {
      setApiKeyMessage(err instanceof Error ? err.message : "Unable to save API key");
    }
  }

  async function deactivateApiKey(apiKeyId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api-keys/${apiKeyId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("Unable to deactivate API key");
      }
      await loadApiKeys();
      setApiKeyMessage("API key deactivated.");
    } catch (err) {
      setApiKeyMessage(err instanceof Error ? err.message : "Unable to deactivate API key");
    }
  }

  async function loadConnections() {
    try {
      const response = await fetch(`${API_BASE_URL}/connections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("Unable to load connections");
      }
      setConnections(await response.json());
    } catch (err) {
      setConnectionMessage(err instanceof Error ? err.message : "Unable to load connections");
    }
  }

  function resetConnectionForm() {
    setEditingConnectionId(null);
    setConnectionForm({ ...emptyConnection });
    setConnectionMessage("");
  }

  function editConnection(connection) {
    setEditingConnectionId(connection.id);
    setConnectionForm({
      ...emptyConnection,
      ...connection,
      password: "",
      config: connection.config ? JSON.stringify(connection.config, null, 2) : "{}",
    });
    setConnectionMessage("");
  }

  function buildConnectionPayload() {
    let parsedConfig = null;
    if (connectionForm.config.trim()) {
      parsedConfig = JSON.parse(connectionForm.config);
    }
    return {
      name: connectionForm.name,
      type: connectionForm.type,
      description: connectionForm.description || null,
      host: connectionForm.host || null,
      port: connectionForm.port ? Number(connectionForm.port) : null,
      database_name: connectionForm.database_name || null,
      username: connectionForm.username || null,
      password: connectionForm.password || undefined,
      base_url: connectionForm.base_url || null,
      mqtt_topic_prefix: connectionForm.mqtt_topic_prefix || null,
      config: parsedConfig,
      status: connectionForm.status || "active",
    };
  }

  async function saveConnection(event) {
    event.preventDefault();
    setConnectionMessage("");
    let payload;
    try {
      payload = buildConnectionPayload();
    } catch {
      setConnectionMessage("Config must be valid JSON.");
      return;
    }
    const url = editingConnectionId
      ? `${API_BASE_URL}/connections/${editingConnectionId}`
      : `${API_BASE_URL}/connections`;
    const method = editingConnectionId ? "PUT" : "POST";
    try {
      const response = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail ? JSON.stringify(detail.detail) : "Unable to save connection");
      }
      resetConnectionForm();
      await loadConnections();
      setConnectionMessage(editingConnectionId ? "Connection updated." : "Connection created.");
    } catch (err) {
      setConnectionMessage(err instanceof Error ? err.message : "Unable to save connection");
    }
  }

  async function deactivateConnection(connectionId) {
    try {
      const response = await fetch(`${API_BASE_URL}/connections/${connectionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("Unable to deactivate connection");
      }
      await loadConnections();
      setConnectionMessage("Connection deactivated.");
    } catch (err) {
      setConnectionMessage(err instanceof Error ? err.message : "Unable to deactivate connection");
    }
  }

  async function testConnection(connectionId) {
    setConnectionMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/connections/${connectionId}/test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("Unable to test connection");
      }
      const data = await response.json();
      await loadConnections();
      setConnectionMessage(`${data.status}: ${data.message}`);
    } catch (err) {
      setConnectionMessage(err instanceof Error ? err.message : "Unable to test connection");
    }
  }

  async function loadDemoSummary() {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/demo/procurement-staging-summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("Unable to load demo data summary");
      }
      const data = await response.json();
      setDemoCounts(data.tables);
      setDemoMessage("");
    } catch (err) {
      setDemoCounts(null);
      setDemoMessage(err instanceof Error ? err.message : "Unable to load demo data summary");
    }
  }

  async function seedDemoData() {
    setDemoMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/admin/demo/seed-procurement-staging`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("Unable to seed procurement staging data");
      }
      const data = await response.json();
      setDemoCounts(data.tables);
      setDemoMessage(data.message);
    } catch (err) {
      setDemoMessage(err instanceof Error ? err.message : "Unable to seed procurement staging data");
    }
  }

  async function loadDbSchemas() {
    setDbBrowserLoading(true);
    setDbBrowserMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/db-browser/schemas`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("Unable to load schemas");
      }
      const data = await response.json();
      setDbSchemas(data.schemas);
      const nextSchema = selectedDbSchema || data.schemas.find((schema) => schema === "mdp_staging") || data.schemas[0] || "";
      setSelectedDbSchema(nextSchema);
      if (nextSchema) {
        await loadDbTables(nextSchema);
      }
    } catch (err) {
      setDbBrowserMessage(err instanceof Error ? err.message : "Unable to load schemas");
    } finally {
      setDbBrowserLoading(false);
    }
  }

  async function loadDbTables(schemaName) {
    setDbBrowserMessage("");
    const response = await fetch(`${API_BASE_URL}/db-browser/schemas/${schemaName}/tables`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error("Unable to load tables");
    }
    const data = await response.json();
    setDbTables(data.tables);
    const nextTable = data.tables[0]?.table_name || "";
    setSelectedDbTable(nextTable);
    if (nextTable) {
      await loadDbTableDetails(schemaName, nextTable);
    } else {
      setDbColumns([]);
      setDbPreview({ columns: [], rows: [] });
    }
  }

  async function handleDbSchemaChange(schemaName) {
    setSelectedDbSchema(schemaName);
    setDbBrowserLoading(true);
    try {
      await loadDbTables(schemaName);
    } catch (err) {
      setDbBrowserMessage(err instanceof Error ? err.message : "Unable to load tables");
    } finally {
      setDbBrowserLoading(false);
    }
  }

  async function loadDbTableDetails(schemaName, tableName) {
    const [columnsResponse, previewResponse] = await Promise.all([
      fetch(`${API_BASE_URL}/db-browser/schemas/${schemaName}/tables/${tableName}/columns`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`${API_BASE_URL}/db-browser/schemas/${schemaName}/tables/${tableName}/preview?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    if (!columnsResponse.ok || !previewResponse.ok) {
      throw new Error("Unable to load table details");
    }
    const columnsData = await columnsResponse.json();
    const previewData = await previewResponse.json();
    setDbColumns(columnsData.columns);
    setDbPreview(previewData);
  }

  async function handleDbTableSelect(tableName) {
    setSelectedDbTable(tableName);
    setDbBrowserLoading(true);
    setDbBrowserMessage("");
    try {
      await loadDbTableDetails(selectedDbSchema, tableName);
    } catch (err) {
      setDbBrowserMessage(err instanceof Error ? err.message : "Unable to load table details");
    } finally {
      setDbBrowserLoading(false);
    }
  }

  async function refreshDbBrowser() {
    setDbBrowserLoading(true);
    setDbBrowserMessage("");
    try {
      if (selectedDbSchema && selectedDbTable) {
        await loadDbTableDetails(selectedDbSchema, selectedDbTable);
      } else {
        await loadDbSchemas();
      }
    } catch (err) {
      setDbBrowserMessage(err instanceof Error ? err.message : "Unable to refresh DB Browser");
    } finally {
      setDbBrowserLoading(false);
    }
  }

  function resetForm() {
    setForm({ ...emptyDataModel, attributes: [{ ...emptyAttribute }] });
    setEditingId(null);
    setModelMessage("");
  }

  async function editModel(model) {
    setModelMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/data-models/${model.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("Unable to load data model");
      }
      const detail = await response.json();
      setEditingId(detail.id);
      setForm({
        ...emptyDataModel,
        ...detail,
        attributes: detail.attributes.map((attribute) => ({
          ...emptyAttribute,
          ...attribute,
        })),
      });
    } catch (err) {
      setModelMessage(err instanceof Error ? err.message : "Unable to load data model");
    }
  }

  function updateAttribute(index, field, value) {
    setForm((current) => ({
      ...current,
      attributes: current.attributes.map((attribute, attributeIndex) =>
        field === "is_primary_key"
          ? {
              ...attribute,
              is_primary_key: attributeIndex === index ? value : false,
            }
          : attributeIndex === index
            ? { ...attribute, [field]: value }
            : attribute,
      ),
      primary_key:
        field === "is_primary_key"
          ? value
            ? current.attributes[index]?.name || ""
            : current.primary_key === current.attributes[index]?.name
              ? ""
              : current.primary_key
          : field === "name" && current.attributes[index]?.is_primary_key
            ? value
            : current.primary_key,
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
    const payload = compactPayload(form);

    try {
      let validationWarnings = [];
      if (form.type === "B") {
        const validationResponse = await fetch(`${API_BASE_URL}/data-models/type-b/validate-mapping`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(payload),
        });
        const validationDetail = await validationResponse.json().catch(() => null);
        if (!validationResponse.ok) {
          throw new Error(formatApiDetail(validationDetail?.detail));
        }
        validationWarnings = validationDetail?.warnings || [];
      }

      const response = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(formatApiDetail(detail?.detail));
      }

      resetForm();
      await loadDataModels();
      const warningText = validationWarnings.length
        ? ` Warnings: ${validationWarnings.map((warning) => warning.message).join(" ")}`
        : "";
      setModelMessage(`${editingId ? "Data model updated." : "Data model created."}${warningText}`);
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
                  : page === "api-keys"
                    ? "API Keys"
                    : page === "connections"
                      ? "Connections"
                      : page === "demo-data"
                        ? "Demo Data"
                        : page === "db-browser"
                          ? "DB Browser"
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
          <button type="button" onClick={() => setPage("api-keys")}>
            API Keys
          </button>
          <button type="button" onClick={() => setPage("connections")}>
            Connections
          </button>
          <button type="button" onClick={() => setPage("demo-data")}>
            Demo Data
          </button>
          <button type="button" onClick={() => setPage("db-browser")}>
            DB Browser
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
          authHeaders={authHeaders}
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
      ) : page === "api-keys" ? (
        <ApiKeysPage
          apiKeys={apiKeys}
          form={apiKeyForm}
          setForm={setApiKeyForm}
          editingId={editingApiKeyId}
          createdPlainApiKey={createdPlainApiKey}
          message={apiKeyMessage}
          saveApiKey={saveApiKey}
          resetForm={resetApiKeyForm}
          editApiKey={editApiKey}
          deactivateApiKey={deactivateApiKey}
        />
      ) : page === "connections" ? (
        <ConnectionsPage
          connections={connections}
          form={connectionForm}
          setForm={setConnectionForm}
          editingId={editingConnectionId}
          message={connectionMessage}
          saveConnection={saveConnection}
          resetForm={resetConnectionForm}
          editConnection={editConnection}
          deactivateConnection={deactivateConnection}
          testConnection={testConnection}
        />
      ) : page === "demo-data" ? (
        <DemoDataPage
          counts={demoCounts}
          message={demoMessage}
          seedDemoData={seedDemoData}
          loadDemoSummary={loadDemoSummary}
        />
      ) : page === "db-browser" ? (
        <DbBrowserPage
          schemas={dbSchemas}
          selectedSchema={selectedDbSchema}
          tables={dbTables}
          selectedTable={selectedDbTable}
          columns={dbColumns}
          preview={dbPreview}
          message={dbBrowserMessage}
          isLoading={dbBrowserLoading}
          onSchemaChange={handleDbSchemaChange}
          onTableSelect={handleDbTableSelect}
          onRefresh={refreshDbBrowser}
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
  authHeaders,
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
              onChange={(event) => {
                const type = event.target.value;
                setForm({
                  ...form,
                  type,
                  attributes: form.attributes.map((attribute) => ({
                    ...attribute,
                    source_schema: type === "B" ? attribute.source_schema || "" : "",
                    source_table: type === "B" ? attribute.source_table || "" : "",
                    source_column: type === "B" ? attribute.source_column || "" : "",
                  })),
                });
              }}
            >
              <option value="A">Type A: Ingested Model</option>
              <option value="B">Type B: Linked Model</option>
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

        {form.type === "B" && (
          <label>
            Business Definition
            <textarea
              value={form.business_definition || ""}
              onChange={(event) =>
                setForm({ ...form, business_definition: event.target.value })
              }
            />
          </label>
        )}

        <div className="form-grid">
          <label>
            Primary Key
            <input
              value={form.primary_key || ""}
              onChange={(event) => setForm({ ...form, primary_key: event.target.value })}
              placeholder={form.type === "B" ? "supplier_code" : "invoice_no"}
            />
          </label>
          <label>
            Sensitivity
            <select
              value={form.sensitivity_level || "internal"}
              onChange={(event) =>
                setForm({ ...form, sensitivity_level: event.target.value })
              }
            >
              <option value="public">public</option>
              <option value="internal">internal</option>
              <option value="confidential">confidential</option>
              <option value="restricted">restricted</option>
            </select>
          </label>
        </div>

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
            : "Type B models do not create new tables. They expose existing staging tables or views as governed data models and APIs."}
        </p>

        {form.generated_table && (
          <label>
            Generated Table
            <input value={form.generated_table} readOnly />
          </label>
        )}

        {form.type === "B" ? (
          <TypeBMappingDesigner
            form={form}
            setForm={setForm}
            editingId={editingId}
            authHeaders={authHeaders}
            updateAttribute={updateAttribute}
            removeAttribute={removeAttribute}
          />
        ) : (
          <>
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
                    {dataTypeOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
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
          </>
        )}

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
              <p>{model.name}</p>
              <p>{model.description || "No description"}</p>
              {model.generated_table && (
                <p className="table-name">{model.generated_table}</p>
              )}
              {model.type === "B" && model.source_schema && model.source_table && (
                <p className="table-name">
                  {model.source_schema}.{model.source_table}
                </p>
              )}
              {model.type === "A" && (
                <p className="table-name">POST /inbound/{model.name}</p>
              )}
              {model.type === "B" && (
                <p className="table-name">GET /data-models/{model.id}/mapped-preview</p>
              )}
            </div>
            <div className="item-actions">
              <button type="button" onClick={() => editModel(model)}>
                View/Edit
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

function TypeBMappingDesigner({
  form,
  setForm,
  editingId,
  authHeaders,
  updateAttribute,
  removeAttribute,
}) {
  const [schemas, setSchemas] = useState([]);
  const [tables, setTables] = useState([]);
  const [columns, setColumns] = useState([]);
  const [message, setMessage] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [errors, setErrors] = useState([]);
  const [preview, setPreview] = useState({ columns: [], rows: [] });
  const [isLoading, setIsLoading] = useState(false);

  const selectedSchema =
    form.attributes.find((attribute) => attribute.source_schema)?.source_schema || "";
  const selectedTable =
    form.attributes.find((attribute) => attribute.source_table)?.source_table || "";

  useEffect(() => {
    let ignore = false;

    async function loadSchemas() {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/db-browser/schemas`, {
          headers: authHeaders,
        });
        if (!response.ok) {
          throw new Error("Unable to load schemas");
        }
        const data = await response.json();
        if (ignore) {
          return;
        }
        setSchemas(data.schemas);
        const nextSchema = selectedSchema || data.schemas.find((schema) => schema === "mdp_staging") || data.schemas[0] || "";
        if (nextSchema && !selectedSchema) {
          applySourceObject(nextSchema, selectedTable);
        }
      } catch (err) {
        if (!ignore) {
          setMessage(err instanceof Error ? err.message : "Unable to load schemas");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadSchemas();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedSchema) {
      return;
    }
    let ignore = false;

    async function loadTables() {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/db-browser/schemas/${selectedSchema}/tables`, {
          headers: authHeaders,
        });
        if (!response.ok) {
          throw new Error("Unable to load tables");
        }
        const data = await response.json();
        if (ignore) {
          return;
        }
        setTables(data.tables);
        if (selectedTable && data.tables.some((table) => table.table_name === selectedTable)) {
          return;
        }
        const nextTable =
          data.tables.find((table) => table.table_name === "stg_jde_supplier")?.table_name ||
          data.tables[0]?.table_name ||
          "";
        if (nextTable) {
          applySourceObject(selectedSchema, nextTable);
        }
      } catch (err) {
        if (!ignore) {
          setMessage(err instanceof Error ? err.message : "Unable to load tables");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadTables();
    return () => {
      ignore = true;
    };
  }, [selectedSchema]);

  useEffect(() => {
    if (!selectedSchema || !selectedTable) {
      setColumns([]);
      return;
    }
    let ignore = false;

    async function loadColumns() {
      setIsLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/db-browser/schemas/${selectedSchema}/tables/${selectedTable}/columns`,
          { headers: authHeaders },
        );
        if (!response.ok) {
          throw new Error("Unable to load columns");
        }
        const data = await response.json();
        if (!ignore) {
          setColumns(data.columns);
        }
      } catch (err) {
        if (!ignore) {
          setMessage(err instanceof Error ? err.message : "Unable to load columns");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadColumns();
    return () => {
      ignore = true;
    };
  }, [selectedSchema, selectedTable]);

  function applySourceObject(sourceSchema, sourceTable) {
    setForm((current) => ({
      ...current,
      attributes: current.attributes.map((attribute) => ({
        ...attribute,
        source_schema: sourceSchema,
        source_table: sourceTable,
      })),
    }));
    setWarnings([]);
    setErrors([]);
    setPreview({ columns: [], rows: [] });
  }

  function addMappedAttribute() {
    const usedColumns = new Set(form.attributes.map((attribute) => attribute.source_column));
    const nextColumn = columns.find((column) => !usedColumns.has(column.column_name));
    const attributeName = attributeNameFromSourceColumn(nextColumn?.column_name);
    setForm((current) => ({
      ...current,
      attributes: [
        ...current.attributes,
        {
          ...emptyAttribute,
          name: attributeName,
          display_name: displayNameFromAttributeName(attributeName),
          data_type: inferPlatformType(nextColumn?.data_type),
          source_schema: selectedSchema,
          source_table: selectedTable,
          source_column: nextColumn?.column_name || "",
        },
      ],
    }));
  }

  function generateAttributes() {
    if (!selectedSchema || !selectedTable || columns.length === 0) {
      setMessage("Select a source table or view with columns first.");
      return;
    }
    setForm((current) => ({
      ...current,
      primary_key: "",
      attributes: columns.map((column) => {
        const attributeName = attributeNameFromSourceColumn(column.column_name);
        return {
          ...emptyAttribute,
          name: attributeName,
          display_name: displayNameFromAttributeName(attributeName),
          data_type: inferPlatformType(column.data_type),
          required: false,
          source_schema: selectedSchema,
          source_table: selectedTable,
          source_column: column.column_name,
        };
      }),
    }));
    setMessage(`${columns.length} attributes generated from ${selectedTable}.`);
    setWarnings([]);
    setErrors([]);
    setPreview({ columns: [], rows: [] });
  }

  function updateMappedAttribute(index, field, value) {
    if (field === "source_column") {
      const sourceColumn = columns.find((column) => column.column_name === value);
      const attributeName = attributeNameFromSourceColumn(value);
      setForm((current) => ({
        ...current,
        attributes: current.attributes.map((attribute, attributeIndex) =>
          attributeIndex === index
            ? {
                ...attribute,
                source_column: value,
                source_schema: selectedSchema,
                source_table: selectedTable,
                name: attribute.name || attributeName,
                display_name: attribute.display_name || displayNameFromAttributeName(attributeName),
                data_type: inferPlatformType(sourceColumn?.data_type),
              }
            : attribute,
        ),
      }));
      return;
    }
    updateAttribute(index, field, value);
  }

  async function validateMapping() {
    setIsLoading(true);
    setMessage("");
    setErrors([]);
    setWarnings([]);
    try {
      const response = await fetch(`${API_BASE_URL}/data-models/type-b/validate-mapping`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(compactPayload(form)),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setErrors(Array.isArray(data?.detail) ? data.detail : [{ field: "mapping", message: formatApiDetail(data?.detail) }]);
        setMessage("Mapping validation failed.");
        return false;
      }
      setWarnings(data.warnings || []);
      setMessage("Type B mapping is valid.");
      return true;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to validate mapping");
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  async function previewMapping(useSaved = false) {
    setIsLoading(true);
    setMessage("");
    setErrors([]);
    try {
      const response = useSaved && editingId
        ? await fetch(`${API_BASE_URL}/data-models/${editingId}/mapped-preview?limit=20`, {
            headers: authHeaders,
          })
        : await fetch(`${API_BASE_URL}/data-models/type-b/preview?limit=20`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify(compactPayload(form)),
          });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setPreview({ columns: [], rows: [] });
        setErrors(Array.isArray(data?.detail) ? data.detail : [{ field: "preview", message: formatApiDetail(data?.detail) }]);
        setMessage("Preview failed.");
        return;
      }
      const rows = data.data || [];
      setWarnings(data.warnings || []);
      setPreview({ columns: rows.length ? Object.keys(rows[0]) : [], rows });
      setMessage(`${data.count || rows.length} preview rows loaded.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to preview mapping");
    } finally {
      setIsLoading(false);
    }
  }

  const hasPrimaryKey = Boolean(
    form.primary_key && form.attributes.some((attribute) => attribute.name === form.primary_key),
  );

  return (
    <section className="type-b-designer">
      <div className="section-heading">
        <div>
          <p className="panel-label">Type B Mapping Designer</p>
          <p className="helper-text">Select a staging table or view that contains migrated ERP data.</p>
        </div>
      </div>

      <div className="form-grid">
        <label>
          Source Schema
          <select
            value={selectedSchema}
            onChange={(event) => applySourceObject(event.target.value, "")}
          >
            <option value="">Select schema</option>
            {schemas.map((schema) => (
              <option key={schema} value={schema}>{schema}</option>
            ))}
          </select>
        </label>
        <label>
          Source Table or View
          <select
            value={selectedTable}
            onChange={(event) => applySourceObject(selectedSchema, event.target.value)}
          >
            <option value="">Select table or view</option>
            {tables.map((table) => (
              <option key={table.table_name} value={table.table_name}>
                {table.table_name} ({table.table_type})
              </option>
            ))}
          </select>
        </label>
      </div>

      {!hasPrimaryKey && (
        <p className="warning-text">Select one primary key attribute before saving.</p>
      )}

      <div className="section-heading">
        <p className="panel-label">Attribute Mapping</p>
        <div className="item-actions">
          <button type="button" onClick={addMappedAttribute}>
            Add Attribute
          </button>
          <button type="button" onClick={generateAttributes}>
            Generate Attributes from Source Columns
          </button>
        </div>
      </div>

      <div className="mapping-table">
        <div className="mapping-row mapping-row--header">
          <span>Attribute</span>
          <span>Display</span>
          <span>Type</span>
          <span>Source Column</span>
          <span>Flags</span>
          <span>Description</span>
          <span>Action</span>
        </div>
        {form.attributes.map((attribute, index) => (
          <div className="mapping-row" key={index}>
            <input
              value={attribute.name}
              onChange={(event) => updateMappedAttribute(index, "name", event.target.value)}
              placeholder="supplier_code"
              required
            />
            <input
              value={attribute.display_name || ""}
              onChange={(event) =>
                updateMappedAttribute(index, "display_name", event.target.value)
              }
              placeholder="Supplier Code"
            />
            <select
              value={attribute.data_type}
              onChange={(event) => updateMappedAttribute(index, "data_type", event.target.value)}
            >
              {dataTypeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <select
              value={attribute.source_column || ""}
              onChange={(event) => updateMappedAttribute(index, "source_column", event.target.value)}
              required
            >
              <option value="">Select column</option>
              {columns.map((column) => (
                <option key={column.column_name} value={column.column_name}>
                  {column.column_name} ({column.data_type})
                </option>
              ))}
            </select>
            <div className="mapping-flags">
              <label className="compact-check">
                <input
                  type="checkbox"
                  checked={attribute.required}
                  onChange={(event) =>
                    updateMappedAttribute(index, "required", event.target.checked)
                  }
                />
                Req
              </label>
              <label className="compact-check">
                <input
                  type="checkbox"
                  checked={attribute.is_primary_key}
                  onChange={(event) =>
                    updateMappedAttribute(index, "is_primary_key", event.target.checked)
                  }
                />
                PK
              </label>
            </div>
            <textarea
              value={attribute.description || ""}
              onChange={(event) =>
                updateMappedAttribute(index, "description", event.target.value)
              }
              placeholder="Description"
            />
            <button type="button" onClick={() => removeAttribute(index)}>
              Remove
            </button>
          </div>
        ))}
      </div>

      <p className="helper-text">
        Preview returns data using model attribute names, not source column names.
      </p>
      <p className="helper-text">
        Reserved system columns are automatically renamed with source_ prefix.
      </p>

      <div className="item-actions">
        <button type="button" onClick={validateMapping} disabled={isLoading}>
          Validate Mapping
        </button>
        <button type="button" onClick={() => previewMapping(false)} disabled={isLoading}>
          Preview Unsaved Mapping
        </button>
        {editingId && (
          <button type="button" onClick={() => previewMapping(true)} disabled={isLoading}>
            Preview Saved Model
          </button>
        )}
      </div>

      {message && <p className="form-message">{message}</p>}
      {warnings.length > 0 && <MessageList title="Warnings" items={warnings} type="warning" />}
      {errors.length > 0 && <MessageList title="Validation Errors" items={errors} type="error" />}

      <div className="browser-results">
        {preview.rows.length > 0 ? (
          <table>
            <thead>
              <tr>
                {preview.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {preview.columns.map((column) => (
                    <td key={column}>{JSON.stringify(row[column])}</td>
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

function MessageList({ title, items, type }) {
  return (
    <div className={`message-list message-list--${type}`}>
      <p className="panel-label">{title}</p>
      {items.map((item, index) => (
        <p key={index}>
          <strong>{item.field || "message"}:</strong> {item.message || item.msg || JSON.stringify(item)}
        </p>
      ))}
    </div>
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

function ApiKeysPage({
  apiKeys,
  form,
  setForm,
  editingId,
  createdPlainApiKey,
  message,
  saveApiKey,
  resetForm,
  editApiKey,
  deactivateApiKey,
}) {
  function toggleDirection(direction) {
    const next = form.allowed_directions.includes(direction)
      ? form.allowed_directions.filter((item) => item !== direction)
      : [...form.allowed_directions, direction];
    setForm({ ...form, allowed_directions: next });
  }

  return (
    <section className="api-keys-layout">
      <form className="model-form" onSubmit={saveApiKey}>
        <div className="section-heading">
          <p className="panel-label">{editingId ? "Edit API Key" : "Create API Key"}</p>
          <button type="button" onClick={resetForm}>New</button>
        </div>
        <div className="form-grid">
          <label>
            Name
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </label>
          <label>
            Source System
            <input value={form.source_system} onChange={(event) => setForm({ ...form, source_system: event.target.value })} placeholder="ERP" />
          </label>
          <label>
            Allowed Models
            <input value={form.allowed_models} onChange={(event) => setForm({ ...form, allowed_models: event.target.value })} placeholder="invoice, quality_result" />
          </label>
          <label>
            Expires At
            <input type="datetime-local" value={form.expires_at} onChange={(event) => setForm({ ...form, expires_at: event.target.value })} />
          </label>
        </div>
        <label>
          Description
          <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </label>
        <div className="direction-row">
          <label className="compact-check">
            <input type="checkbox" checked={form.allowed_directions.includes("inbound")} onChange={() => toggleDirection("inbound")} />
            Inbound
          </label>
          <label className="compact-check">
            <input type="checkbox" checked={form.allowed_directions.includes("outbound")} onChange={() => toggleDirection("outbound")} />
            Outbound
          </label>
          <label className="compact-check">
            <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
            Active
          </label>
        </div>
        <button className="primary-button" type="submit">{editingId ? "Update API Key" : "Create API Key"}</button>
        {createdPlainApiKey && (
          <div className="secret-panel">
            <p>Copy this API key now. It will not be shown again.</p>
            <code>{createdPlainApiKey}</code>
          </div>
        )}
        {message && <p className="form-message">{message}</p>}
      </form>

      <section className="model-list">
        {apiKeys.map((apiKey) => (
          <article className="model-item" key={apiKey.id}>
            <div>
              <p className="panel-label">{apiKey.key_prefix} · {apiKey.is_active ? "active" : "inactive"}</p>
              <h2>{apiKey.name}</h2>
              <p>{apiKey.source_system || "No source system"}</p>
              <p>{apiKey.allowed_directions.join(", ")} · {apiKey.allowed_models?.join(", ") || "all models"}</p>
            </div>
            <div className="item-actions">
              <button type="button" onClick={() => editApiKey(apiKey)}>Edit</button>
              <button type="button" onClick={() => deactivateApiKey(apiKey.id)} disabled={!apiKey.is_active}>Deactivate</button>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}

function ConnectionsPage({
  connections,
  form,
  setForm,
  editingId,
  message,
  saveConnection,
  resetForm,
  editConnection,
  deactivateConnection,
  testConnection,
}) {
  const isDatabase = ["postgresql", "oracle", "sqlserver"].includes(form.type);
  const isRestApi = form.type === "rest_api";
  const isMqtt = form.type === "mqtt";

  return (
    <section className="connections-layout">
      <form className="model-form" onSubmit={saveConnection}>
        <div className="section-heading">
          <p className="panel-label">{editingId ? "Edit Connection" : "Create Connection"}</p>
          <button type="button" onClick={resetForm}>New</button>
        </div>

        <div className="form-grid">
          <label>
            Name
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="jde_production" required />
          </label>
          <label>
            Type
            <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              <option value="postgresql">PostgreSQL</option>
              <option value="oracle">Oracle</option>
              <option value="sqlserver">SQL Server</option>
              <option value="rest_api">REST API</option>
              <option value="mqtt">MQTT</option>
            </select>
          </label>
          {(isDatabase || isMqtt) && (
            <>
              <label>
                Host
                <input value={form.host || ""} onChange={(event) => setForm({ ...form, host: event.target.value })} placeholder="db.example.local" />
              </label>
              <label>
                Port
                <input type="number" min="1" max="65535" value={form.port || ""} onChange={(event) => setForm({ ...form, port: event.target.value })} />
              </label>
            </>
          )}
          {isDatabase && (
            <>
              <label>
                Database Name
                <input value={form.database_name || ""} onChange={(event) => setForm({ ...form, database_name: event.target.value })} placeholder="JDEPROD" />
              </label>
              <label>
                Username
                <input value={form.username || ""} onChange={(event) => setForm({ ...form, username: event.target.value })} />
              </label>
              <label>
                Password
                <input type="password" value={form.password || ""} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={editingId ? "Leave blank to keep current password" : ""} />
              </label>
            </>
          )}
          {isRestApi && (
            <label>
              Base URL
              <input value={form.base_url || ""} onChange={(event) => setForm({ ...form, base_url: event.target.value })} placeholder="https://api.example.com/health" />
            </label>
          )}
          {isMqtt && (
            <label>
              MQTT Topic Prefix
              <input value={form.mqtt_topic_prefix || ""} onChange={(event) => setForm({ ...form, mqtt_topic_prefix: event.target.value })} placeholder="plant/site1" />
            </label>
          )}
          <label>
            Status
            <select value={form.status || "active"} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>

        <label>
          Description
          <textarea value={form.description || ""} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </label>

        <label>
          Config JSON
          <textarea value={form.config || "{}"} onChange={(event) => setForm({ ...form, config: event.target.value })} />
        </label>

        <button className="primary-button" type="submit">{editingId ? "Update Connection" : "Create Connection"}</button>
        {message && <p className="form-message">{message}</p>}
      </form>

      <section className="model-list">
        {connections.map((connection) => (
          <article className="model-item" key={connection.id}>
            <div>
              <p className="panel-label">{connection.type} - {connection.status}</p>
              <h2>{connection.name}</h2>
              <p>{connection.description || connection.host || connection.base_url || "No endpoint details"}</p>
              <p className="table-name">
                last test: {connection.last_test_status || "not tested"}
                {connection.last_test_at ? ` at ${new Date(connection.last_test_at).toLocaleString()}` : ""}
              </p>
              {connection.last_test_message && (
                <p className="table-name">{connection.last_test_message}</p>
              )}
            </div>
            <div className="item-actions">
              <button type="button" onClick={() => editConnection(connection)}>Edit</button>
              <button type="button" onClick={() => testConnection(connection.id)}>Test</button>
              <button type="button" onClick={() => deactivateConnection(connection.id)} disabled={connection.status === "inactive"}>Deactivate</button>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}

function DemoDataPage({ counts, message, seedDemoData, loadDemoSummary }) {
  const tableLabels = {
    stg_jde_supplier: "Supplier Master",
    stg_jde_po_header: "PO Header",
    stg_jde_po_line: "PO Line",
    stg_jde_po_receipt: "PO Receipt",
    stg_jde_ap_invoice: "AP Invoice",
  };

  return (
    <section className="demo-data-panel">
      <div className="model-form">
        <div className="section-heading">
          <div>
            <p className="panel-label">JDE Procurement Demo</p>
            <h2>Mock staging data</h2>
          </div>
          <div className="item-actions">
            <button type="button" onClick={loadDemoSummary}>Refresh Counts</button>
            <button type="button" onClick={seedDemoData}>Seed Procurement Staging Data</button>
          </div>
        </div>
        <p className="helper-text">
          The mdp_staging tables simulate JDE procurement data already migrated into PostgreSQL by an external ETL tool.
        </p>
        {message && <p className="form-message">{message}</p>}
      </div>

      <section className="model-list">
        {Object.entries(tableLabels).map(([tableName, label]) => (
          <article className="model-item" key={tableName}>
            <div>
              <p className="panel-label">{tableName}</p>
              <h2>{counts?.[tableName] ?? "-"}</h2>
              <p>{label}</p>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}

function DbBrowserPage({
  schemas,
  selectedSchema,
  tables,
  selectedTable,
  columns,
  preview,
  message,
  isLoading,
  onSchemaChange,
  onTableSelect,
  onRefresh,
}) {
  return (
    <section className="db-browser-panel">
      <div className="browser-controls">
        <label>
          Schema
          <select
            value={selectedSchema}
            onChange={(event) => onSchemaChange(event.target.value)}
          >
            {schemas.map((schema) => (
              <option key={schema} value={schema}>{schema}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      {message && <p className="form-message">{message}</p>}
      {isLoading && <p className="form-message">Loading database metadata...</p>}

      <div className="db-browser-grid">
        <section className="model-list">
          {tables.map((table) => (
            <article
              className={`model-item ${selectedTable === table.table_name ? "model-item--selected" : ""}`}
              key={table.table_name}
            >
              <div>
                <p className="panel-label">{table.table_type}</p>
                <h2>{table.table_name}</h2>
              </div>
              <div className="item-actions">
                <button type="button" onClick={() => onTableSelect(table.table_name)}>
                  Preview
                </button>
              </div>
            </article>
          ))}
        </section>

        <section className="db-browser-detail">
          <article className="model-form">
            <div className="section-heading">
              <div>
                <p className="panel-label">{selectedSchema || "-"}</p>
                <h2>{selectedTable || "Select a table"}</h2>
              </div>
            </div>
            <div className="browser-results">
              <table>
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Type</th>
                    <th>Nullable</th>
                    <th>Default</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((column) => (
                    <tr key={column.column_name}>
                      <td>{column.column_name}</td>
                      <td>{column.data_type}</td>
                      <td>{column.is_nullable}</td>
                      <td>{column.column_default || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <div className="browser-results">
            {preview.rows?.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    {preview.columns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, index) => (
                    <tr key={index}>
                      {preview.columns.map((column) => (
                        <td key={column}>{JSON.stringify(row[column])}</td>
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
      </div>
    </section>
  );
}

export default App;
