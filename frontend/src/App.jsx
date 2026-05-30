import { Fragment, useEffect, useMemo, useState } from "react";
import avenueLogo from "./avenue-logo.svg";
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
  refresh_policy: "",
  namespace: "",
  domain: "",
  entity_type: "",
  business_process: "",
  source_layer: "",
  canonical_status: "experimental",
  site_scope: "enterprise",
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
const navGroups = [
  {
    label: "Overview",
    items: [["dashboard", "Dashboard", "D"]],
  },
  {
    label: "Data Management",
    items: [
      ["data-models", "Data Models", "M"],
      ["db-browser", "DB Browser", "DB"],
      ["data-browser", "Data Browser", "API"],
      ["demo-data", "Demo Data", "JDE"],
    ],
  },
  {
    label: "Integration & Access",
    items: [
      ["connections", "Connections", "C"],
      ["api-keys", "API Keys", "K"],
    ],
  },
  {
    label: "Monitoring",
    items: [["transactions", "Transactions", "T"]],
  },
  {
    label: "Administration",
    items: [["users", "Users", "U"]],
  },
];
const navItems = navGroups.flatMap((group) => group.items);
const pageTitles = Object.fromEntries(navItems);
const pageDescriptions = {
  dashboard: "Overview of governed data models, integrations, and platform activity.",
  "data-models": "Create and manage Type A and Type B governed data models.",
  "db-browser": "Inspect PostgreSQL schemas, tables, views, columns, and preview data.",
  "data-browser": "Browse outbound API results using governed data models.",
  "api-keys": "Manage secure access for external systems, BI tools, and future AI agents.",
  transactions: "Monitor inbound and outbound data transactions and errors.",
  connections: "Configure and test external data source connections.",
  "demo-data": "Seed and inspect mock procurement staging data for MVP demos.",
  users: "Manage user access to the platform.",
};
const categoryOptions = [
  "",
  "procurement",
  "finance",
  "quality",
  "production",
  "maintenance",
  "inventory",
  "master_data",
];
const sourceSystemOptions = [
  "",
  "JDE ERP",
  "External API",
  "Manual / Mock Data",
  "SQL Server",
  "PostgreSQL",
  "Other",
];
const ownerDepartmentOptions = [
  "",
  "Procurement",
  "Finance",
  "Operations",
  "Quality",
  "Maintenance",
  "IT/OT",
  "Other",
];
const sensitivityOptions = ["public", "internal", "confidential", "restricted"];
const domainOptions = [
  "",
  "master_data",
  "procurement",
  "inventory",
  "production",
  "quality",
  "maintenance",
  "asset",
  "energy",
  "finance",
  "sales",
  "logistics",
  "iiot",
  "other",
];
const businessProcessOptions = [
  "",
  "procure_to_pay",
  "order_to_cash",
  "plan_to_produce",
  "quality_management",
  "maintenance_management",
  "inventory_management",
  "asset_management",
  "energy_management",
  "iiot_monitoring",
  "other",
];
const sourceLayerOptions = [
  "",
  "source",
  "staging",
  "canonical",
  "curated_view",
  "analytical",
  "external_api",
  "generated_table",
];
const canonicalStatusOptions = ["", "source_aligned", "canonical", "curated", "experimental", "deprecated"];
const siteScopeOptions = ["", "enterprise", "site", "area", "line", "work_center", "asset", "not_applicable"];
const apiKeySourceSystems = ["", "External Test Client", "ESB", "BI", "AI Agent", "QMS", "MES", "ERP", "Other"];
const roleOptions = [
  ["admin", "Admin"],
  ["data_engineer", "Data Engineer"],
  ["api_manager", "API Manager"],
  ["viewer", "Viewer"],
];
const reservedQueryParams = new Set(["limit", "offset", "include_meta", "include_raw"]);
const reservedSourceAttributeNames = {
  id: "source_id",
  raw_payload: "source_raw_payload",
  created_at: "source_created_at",
  updated_at: "source_updated_at",
};

function attributeNameFromSourceColumn(columnName = "") {
  const sanitized = columnName
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return reservedSourceAttributeNames[sanitized] || sanitized;
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

function getModelSource(model) {
  if (model.generated_table) {
    return model.generated_table;
  }
  if (model.source_schema && model.source_table) {
    return `${model.source_schema}.${model.source_table}`;
  }
  const mappedAttribute = model.attributes?.find((attribute) => attribute.source_schema && attribute.source_table);
  if (mappedAttribute) {
    return `${mappedAttribute.source_schema}.${mappedAttribute.source_table}`;
  }
  return "-";
}

function getModelSourceLabel(model) {
  const source = getModelSource(model);
  if (source === "-") {
    return "-";
  }
  return model.type === "A" ? `Generated: ${source}` : `Linked: ${source}`;
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function formatJson(value) {
  if (value === null || value === undefined) {
    return "-";
  }
  return JSON.stringify(value, null, 2);
}

function getModelAttributes(model) {
  return model?.attributes?.map((attribute) => attribute.name).filter(Boolean) || [];
}

function isToday(value) {
  if (!value) {
    return false;
  }
  return new Date(value).toDateString() === new Date().toDateString();
}

function Badge({ children, tone = "neutral" }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

function EllipsisText({ value, className = "" }) {
  const displayValue = value || "-";
  return (
    <span className={`ellipsis-text ${className}`} title={displayValue}>
      {displayValue}
    </span>
  );
}

function badgeTone(value = "") {
  const normalized = String(value).toLowerCase();
  if (["active", "success", "ok", "posted", "paid"].includes(normalized)) {
    return "success";
  }
  if (["failed", "inactive", "error", "cancelled"].includes(normalized)) {
    return "danger";
  }
  if (["warning", "open", "pending", "partial"].includes(normalized)) {
    return "warning";
  }
  if (["a", "inbound", "base table"].includes(normalized)) {
    return "info";
  }
  if (["b", "outbound", "view"].includes(normalized)) {
    return "accent";
  }
  return "neutral";
}

function SectionCard({ title, eyebrow, children, actions, className = "" }) {
  return (
    <section className={`section-card ${className}`}>
      {(title || eyebrow || actions) && (
        <div className="section-heading">
          <div>
            {eyebrow && <p className="panel-label">{eyebrow}</p>}
            {title && <h2>{title}</h2>}
          </div>
          {actions && <div className="item-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

function EmptyState({ message }) {
  return <p className="empty-state">{message}</p>;
}

function ActionIcon({ name }) {
  const commonProps = {
    "aria-hidden": "true",
    fill: "none",
    height: "18",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: "2",
    viewBox: "0 0 24 24",
    width: "18",
  };
  if (name === "eye") {
    return (
      <svg {...commonProps}>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  if (name === "edit") {
    return (
      <svg {...commonProps}>
        <path d="M12 20h9" />
        <path d="m16.5 3.5 4 4L8 20H4v-4L16.5 3.5Z" />
      </svg>
    );
  }
  if (name === "preview") {
    return (
      <svg {...commonProps}>
        <path d="M3 5h18" />
        <path d="M3 12h18" />
        <path d="M3 19h18" />
        <path d="M8 5v14" />
        <path d="m16 15 3 3" />
        <circle cx="14" cy="13" r="3" />
      </svg>
    );
  }
  if (name === "key") {
    return (
      <svg {...commonProps}>
        <circle cx="7.5" cy="14.5" r="3.5" />
        <path d="M10 12 21 3" />
        <path d="m16 8 2 2" />
        <path d="m19 5 2 2" />
      </svg>
    );
  }
  return (
    <svg {...commonProps}>
      <path d="M12 2v10" />
      <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
    </svg>
  );
}

function IconActionButton({ label, icon, onClick, disabled = false, tone = "neutral" }) {
  return (
    <button
      aria-label={label}
      className={`icon-action icon-action--${tone}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <ActionIcon name={icon} />
      <span className="sr-only">{label}</span>
    </button>
  );
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
    refresh_policy: form.refresh_policy || null,
    namespace: form.namespace || null,
    domain: form.domain || null,
    entity_type: form.entity_type || null,
    business_process: form.business_process || null,
    source_layer: form.source_layer || null,
    canonical_status: form.canonical_status || null,
    site_scope: form.site_scope || null,
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
  const [browserLookupRecord, setBrowserLookupRecord] = useState(null);
  const [browserLimit, setBrowserLimit] = useState(100);
  const [browserOffset, setBrowserOffset] = useState(0);
  const [browserFilterField, setBrowserFilterField] = useState("");
  const [browserFilterValue, setBrowserFilterValue] = useState("");
  const [browserAppliedFilters, setBrowserAppliedFilters] = useState([]);
  const [browserLookupKey, setBrowserLookupKey] = useState("");
  const [browserMessage, setBrowserMessage] = useState("");
  const [apiKeys, setApiKeys] = useState([]);
  const [apiKeyForm, setApiKeyForm] = useState({
    name: "",
    description: "",
    source_system: "",
    allowed_directions: ["inbound", "outbound"],
    allowed_model_scope: "all",
    allowed_models: [],
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
  const [dataModelDrawerMode, setDataModelDrawerMode] = useState(null);
  const [viewModel, setViewModel] = useState(null);
  const [viewModelPreview, setViewModelPreview] = useState({ columns: [], rows: [] });
  const [modelFilters, setModelFilters] = useState({
    search: "",
    type: "all",
    status: "active",
    category: "all",
    domain: "all",
    source_layer: "all",
    canonical_status: "all",
    ai_enabled: "all",
  });
  const [transactionFilters, setTransactionFilters] = useState({
    search: "",
    direction: "all",
    protocol: "all",
    status: "all",
    data_model_id: "all",
    auth_type: "all",
  });
  const [users, setUsers] = useState([]);
  const [usersMessage, setUsersMessage] = useState("");
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
    if (!token) {
      return;
    }
    loadDataModels();
    loadApiKeys();
    loadConnections();
    loadTransactions();
    loadDemoSummary();
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
    if (token && page === "users") {
      loadUsers();
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

  async function loadUsers() {
    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("Unable to load users");
      }
      setUsers(await response.json());
      setUsersMessage("");
    } catch (err) {
      setUsersMessage(err instanceof Error ? err.message : "Unable to load users");
    }
  }

  async function loadBrowserModels() {
    try {
      const response = await fetch(`${API_BASE_URL}/data-models?status=active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("Unable to load active data models");
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
      const params = new URLSearchParams({
        limit: String(browserLimit),
        offset: String(browserOffset),
      });
      for (const filter of browserAppliedFilters) {
        params.append(filter.field, filter.value);
      }
      const response = await fetch(`${API_BASE_URL}/outbound/${selectedBrowserModel}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || "Unable to load records");
      }
      const data = await response.json();
      setBrowserRecords(data.data);
      setBrowserLookupRecord(null);
      setBrowserMessage(`${data.count} records loaded.`);
    } catch (err) {
      setBrowserRecords([]);
      setBrowserMessage(err instanceof Error ? err.message : "Unable to load records");
    }
  }

  function addBrowserFilter() {
    if (!browserFilterField || !browserFilterValue.trim() || reservedQueryParams.has(browserFilterField)) {
      setBrowserMessage("Select an attribute and enter a filter value.");
      return;
    }
    setBrowserAppliedFilters((current) => [
      ...current.filter((filter) => filter.field !== browserFilterField),
      { field: browserFilterField, value: browserFilterValue.trim() },
    ]);
    setBrowserFilterValue("");
    setBrowserMessage("");
  }

  function removeBrowserFilter(field) {
    setBrowserAppliedFilters((current) => current.filter((filter) => filter.field !== field));
  }

  function clearBrowserFilters() {
    setBrowserAppliedFilters([]);
    setBrowserFilterField("");
    setBrowserFilterValue("");
    setBrowserMessage("");
  }

  async function loadBrowserRecordByKey(event) {
    event?.preventDefault();
    if (!selectedBrowserModel || !browserLookupKey.trim()) {
      setBrowserMessage("Select a model and enter a primary key value.");
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/outbound/${selectedBrowserModel}/${encodeURIComponent(browserLookupKey.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.detail || "Lookup failed");
      }
      setBrowserLookupRecord(data.data);
      setBrowserMessage(`Record loaded for ${browserLookupKey.trim()}.`);
    } catch (err) {
      setBrowserLookupRecord(null);
      setBrowserMessage(err instanceof Error ? err.message : "Lookup failed");
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
      allowed_model_scope: "all",
      allowed_models: [],
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
      allowed_model_scope: apiKey.allowed_models?.length ? "selected" : "all",
      allowed_models: apiKey.allowed_models || [],
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
      allowed_models:
        apiKeyForm.allowed_model_scope === "selected"
          ? apiKeyForm.allowed_models
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
    setDbColumns([]);
    setDbPreview({ columns: [], rows: [] });
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
      fetch(`${API_BASE_URL}/db-browser/schemas/${schemaName}/tables/${tableName}/preview?limit=20`, {
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

  function handleDbTableSelect(tableName) {
    setSelectedDbTable(tableName);
    setDbColumns([]);
    setDbPreview({ columns: [], rows: [] });
    setDbBrowserMessage("");
  }

  async function loadSelectedDbTableData() {
    if (!selectedDbSchema || !selectedDbTable) {
      setDbBrowserMessage("Select a schema and table/view first.");
      return;
    }
    setDbBrowserLoading(true);
    setDbBrowserMessage("");
    try {
      await loadDbTableDetails(selectedDbSchema, selectedDbTable);
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
        await loadDbTables(selectedDbSchema);
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

  function closeDataModelDrawer() {
    setDataModelDrawerMode(null);
    setViewModel(null);
    setViewModelPreview({ columns: [], rows: [] });
    resetForm();
  }

  function openCreateModel() {
    resetForm();
    setViewModel(null);
    setViewModelPreview({ columns: [], rows: [] });
    setDataModelDrawerMode("create");
  }

  async function loadModelIntoDrawer(model, mode) {
    setModelMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/data-models/${model.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("Unable to load data model");
      }
      const detail = await response.json();
      const normalizedDetail = {
        ...emptyDataModel,
        ...detail,
        attributes: detail.attributes.map((attribute) => ({
          ...emptyAttribute,
          ...attribute,
        })),
      };
      setViewModel(normalizedDetail);
      if (mode === "preview" && normalizedDetail.type === "B") {
        const previewResponse = await fetch(`${API_BASE_URL}/data-models/${normalizedDetail.id}/mapped-preview?limit=20`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (previewResponse.ok) {
          const previewData = await previewResponse.json();
          const rows = previewData.data || [];
          setViewModelPreview({ columns: rows.length ? Object.keys(rows[0]) : [], rows });
        } else {
          setViewModelPreview({ columns: [], rows: [] });
        }
      } else {
        setViewModelPreview({ columns: [], rows: [] });
      }
      setEditingId(mode === "edit" ? detail.id : null);
      setForm(normalizedDetail);
      setDataModelDrawerMode(mode);
    } catch (err) {
      setModelMessage(err instanceof Error ? err.message : "Unable to load data model");
    }
  }

  function viewDataModel(model) {
    loadModelIntoDrawer(model, "view");
  }

  function editModel(model) {
    loadModelIntoDrawer(model, "edit");
  }

  function previewDataModel(model) {
    loadModelIntoDrawer(model, "preview");
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

      await loadDataModels();
      const warningText = validationWarnings.length
        ? ` Warnings: ${validationWarnings.map((warning) => warning.message).join(" ")}`
        : "";
      setModelMessage(`${editingId ? "Data model updated." : "Data model created."}${warningText}`);
      closeDataModelDrawer();
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

  async function activateModel(modelId) {
    setModelMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/data-models/${modelId}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ status: "active" }),
      });
      if (!response.ok) {
        throw new Error("Activate failed");
      }
      await loadDataModels();
      setModelMessage("Data model activated.");
    } catch (err) {
      setModelMessage(err instanceof Error ? err.message : "Activate failed");
    }
  }

  function startTypeBTemplate(templateName) {
    const templates = {
      supplier: {
        name: "supplier",
        display_name: "Supplier",
        category: "procurement",
        namespace: "avenue.demo.procurement.supplier",
        domain: "procurement",
        entity_type: "supplier",
        business_process: "procure_to_pay",
        source_layer: "staging",
        canonical_status: "canonical",
        site_scope: "enterprise",
        source_system: "JDE ERP",
        owner_department: "Procurement",
        primary_key: "supplier_code",
        description: "Supplier master data linked from JDE staging data",
        business_definition: "A business entity that provides goods or services.",
      },
      purchase_order_summary: {
        name: "purchase_order_summary",
        display_name: "Purchase Order Summary",
        category: "procurement",
        namespace: "avenue.demo.procurement.purchase_order_summary",
        domain: "procurement",
        entity_type: "purchase_order",
        business_process: "procure_to_pay",
        source_layer: "curated_view",
        canonical_status: "curated",
        site_scope: "enterprise",
        source_system: "JDE ERP",
        owner_department: "Procurement",
        primary_key: "po_no",
        description: "Curated purchase order summary linked from JDE procurement staging view",
        business_definition: "One governed row per purchase order with supplier, line, and invoice summary fields.",
      },
    };
    const template = templates[templateName] || {};
    setEditingId(null);
    setForm({
      ...emptyDataModel,
      ...template,
      type: "B",
      attributes: [{ ...emptyAttribute, source_schema: "mdp_staging" }],
    });
    setViewModel(null);
    setDataModelDrawerMode("create");
    setModelMessage("Select the source table or view, then generate attributes from source columns.");
    setPage("data-models");
  }

  function openModelInBrowser(modelName) {
    setSelectedBrowserModel(modelName);
    setBrowserAppliedFilters([]);
    setBrowserLookupRecord(null);
    setBrowserMessage("");
    setPage("data-browser");
  }

  if (!token) {
    return (
      <main className="auth-page">
        <section className="auth-layout">
          <div className="auth-brand">
            <div className="brand-mark">A</div>
            <p className="eyebrow">Avenue Manufacturing Data Platform</p>
            <h1>Avenue MDP</h1>
            <p className="summary">
              Governed data platform for manufacturing operations and enterprise integration.
            </p>
          </div>
          <section className="auth-panel">
            <p className="eyebrow">Secure Admin Access</p>
            <h2>Sign in to Avenue MDP</h2>
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
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <img src={avenueLogo} alt="Avenue Business Solutions" />
        </div>
        <nav className="side-nav" aria-label="Admin navigation">
          {navGroups.map((group) => (
            <div className="side-nav__group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map(([key, label, icon]) => (
                <button
                  className={page === key ? "side-nav__item side-nav__item--active" : "side-nav__item"}
                  key={key}
                  type="button"
                  onClick={() => setPage(key)}
                >
                  <span className="nav-icon">{icon}</span>
                  {label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-user">
          <div>
            <span>{currentUser?.full_name || currentUser?.username || "User"}</span>
            <small>{currentUser?.role || "admin"}</small>
          </div>
          <button type="button" onClick={handleLogout}>Logout</button>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">Avenue MDP / {pageTitles[page] || "Transactions"}</p>
            <h1>{pageTitles[page] || "Transactions"}</h1>
            <p className="summary">
              {pageDescriptions[page] || "Govern staging data, data models, APIs, access keys, and integration activity."}
            </p>
          </div>
          <div className="user-menu">
            <input aria-label="Search" placeholder="Search Avenue MDP" />
            <button className="icon-button" type="button" aria-label="Help">?</button>
            <button className="icon-button" type="button" aria-label="Notifications">!</button>
            <span>{currentUser?.full_name || currentUser?.username || "User"}</span>
          </div>
        </header>

        {page === "dashboard" ? (
          <Dashboard
            currentUser={currentUser}
            health={health}
            dataModels={dataModels}
            apiKeys={apiKeys}
            connections={connections}
            transactions={transactions}
            demoCounts={demoCounts}
            setPage={setPage}
            startTypeBTemplate={startTypeBTemplate}
          />
        ) : page === "data-models" ? (
          <DataModelsPage
            dataModels={dataModels}
            form={form}
            setForm={setForm}
            editingId={editingId}
            authHeaders={authHeaders}
            modelMessage={modelMessage}
            modelFilters={modelFilters}
            setModelFilters={setModelFilters}
            saveDataModel={saveDataModel}
            resetForm={resetForm}
            drawerMode={dataModelDrawerMode}
            viewModel={viewModel}
            viewModelPreview={viewModelPreview}
            openCreateModel={openCreateModel}
            closeDataModelDrawer={closeDataModelDrawer}
            viewDataModel={viewDataModel}
            editModel={editModel}
            previewDataModel={previewDataModel}
            deactivateModel={deactivateModel}
            activateModel={activateModel}
            openModelInBrowser={openModelInBrowser}
            updateAttribute={updateAttribute}
            addAttribute={addAttribute}
            removeAttribute={removeAttribute}
          />
        ) : page === "data-browser" ? (
          <DataBrowserPage
            models={browserModels}
            selectedModel={selectedBrowserModel}
            setSelectedModel={(modelName) => {
              setSelectedBrowserModel(modelName);
              setBrowserAppliedFilters([]);
              setBrowserLookupRecord(null);
              setBrowserMessage("");
            }}
            limit={browserLimit}
            setLimit={setBrowserLimit}
            offset={browserOffset}
            setOffset={setBrowserOffset}
            filterField={browserFilterField}
            setFilterField={setBrowserFilterField}
            filterValue={browserFilterValue}
            setFilterValue={setBrowserFilterValue}
            appliedFilters={browserAppliedFilters}
            addFilter={addBrowserFilter}
            removeFilter={removeBrowserFilter}
            clearFilters={clearBrowserFilters}
            lookupKey={browserLookupKey}
            setLookupKey={setBrowserLookupKey}
            lookupRecord={browserLookupRecord}
            records={browserRecords}
            message={browserMessage}
            loadRecords={loadBrowserRecords}
            loadRecordByKey={loadBrowserRecordByKey}
          />
        ) : page === "api-keys" ? (
          <ApiKeysPage
            apiKeys={apiKeys}
            dataModels={dataModels}
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
            onLoadData={loadSelectedDbTableData}
            onRefresh={refreshDbBrowser}
          />
        ) : page === "users" ? (
          <UsersPage
            users={users}
            currentUser={currentUser}
            authHeaders={authHeaders}
            message={usersMessage}
            setMessage={setUsersMessage}
            loadUsers={loadUsers}
          />
        ) : (
          <TransactionsPage
            transactions={transactions}
            dataModels={dataModels}
            filters={transactionFilters}
            setFilters={setTransactionFilters}
            expandedTransactionId={expandedTransactionId}
            setExpandedTransactionId={setExpandedTransactionId}
          />
        )}
      </section>
    </main>
  );
}

function Dashboard({
  currentUser,
  health,
  dataModels,
  apiKeys,
  connections,
  transactions,
  demoCounts,
  setPage,
  startTypeBTemplate,
}) {
  const typeAModels = dataModels.filter((model) => model.type === "A");
  const typeBModels = dataModels.filter((model) => model.type === "B");
  const inboundToday = transactions.filter(
    (transaction) => transaction.direction === "inbound" && isToday(transaction.created_at),
  ).length;
  const outboundToday = transactions.filter(
    (transaction) => transaction.direction === "outbound" && isToday(transaction.created_at),
  ).length;
  const failedTransactions = transactions.filter((transaction) => transaction.status === "failed").length;
  const failedToday = transactions.filter(
    (transaction) => transaction.status === "failed" && isToday(transaction.created_at),
  ).length;
  const modelById = Object.fromEntries(dataModels.map((model) => [model.id, model]));
  const recentTransactions = transactions.slice(0, 6);
  const metrics = [
    ["Total data models", dataModels.length],
    ["Type A models", typeAModels.length],
    ["Type B models", typeBModels.length],
    ["Active API keys", apiKeys.filter((apiKey) => apiKey.is_active).length],
    ["Active connections", connections.filter((connection) => connection.status === "active").length],
    ["Outbound today", outboundToday],
    ["Failed today", failedToday],
  ];

  return (
    <section className="page-stack">
      <section className="solution-banner">
        <div>
          <p className="panel-label">Solution Name</p>
          <h2>Manufacturing Data Platform</h2>
        </div>
        <Badge tone="accent">Avenue MDP</Badge>
      </section>

      <div className="kpi-grid">
        {metrics.map(([label, value]) => (
          <article className="metric-card" key={label}>
            <p className="panel-label">{label}</p>
            <h2>{value}</h2>
          </article>
        ))}
      </div>

      <div className="dashboard-split">
        <SectionCard title="Platform Overview" eyebrow="MVP Value">
          <h3>Govern ERP and staging data through reusable APIs</h3>
          <p className="helper-text">
            Browse migrated procurement data, model it as Type A or Type B, expose outbound APIs, issue scoped API keys, and monitor every integration call.
          </p>
          <div className="summary-grid">
            <div>
              <span>{inboundToday}</span>
              <small>Inbound today</small>
            </div>
            <div>
              <span>{failedTransactions}</span>
              <small>Total failed transactions</small>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Quick Actions" eyebrow="Demo Workflow">
          <div className="quick-link-grid">
            <button type="button" onClick={() => setPage("data-models")}>Create Data Model</button>
            <button type="button" onClick={() => setPage("api-keys")}>Create API Key</button>
            <button type="button" onClick={() => setPage("connections")}>Add Connection</button>
            <button type="button" onClick={() => setPage("data-browser")}>Browse Data</button>
            <button type="button" onClick={() => setPage("db-browser")}>Open DB Browser</button>
            <button type="button" onClick={() => setPage("demo-data")}>Seed Demo Data</button>
            <button type="button" onClick={() => startTypeBTemplate("supplier")}>Type B Supplier</button>
            <button type="button" onClick={() => startTypeBTemplate("purchase_order_summary")}>PO Summary Model</button>
          </div>
        </SectionCard>
      </div>

      <div className="dashboard-split">
        <SectionCard title="Recent Transactions" eyebrow="Monitoring">
          <div className="browser-results">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Direction</th>
                  <th>Model</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{new Date(transaction.created_at).toLocaleString()}</td>
                    <td><Badge tone={badgeTone(transaction.direction)}>{transaction.direction}</Badge></td>
                    <td>{modelById[transaction.data_model_id]?.name || transaction.data_model_id || "-"}</td>
                    <td><Badge tone={badgeTone(transaction.status)}>{transaction.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recentTransactions.length === 0 && <EmptyState message="No transactions logged yet." />}
          </div>
        </SectionCard>

        <SectionCard title="Activity Snapshot" eyebrow="Operations">
          <div className="activity-bars">
            <div>
              <span>Inbound today</span>
              <strong style={{ width: `${Math.min(inboundToday * 12, 100)}%` }} />
            </div>
            <div>
              <span>Outbound today</span>
              <strong style={{ width: `${Math.min(outboundToday * 12, 100)}%` }} />
            </div>
            <div>
              <span>Failed today</span>
              <strong style={{ width: `${Math.min(failedToday * 16, 100)}%` }} />
            </div>
          </div>
          <p className="helper-text">
            {demoCounts
              ? Object.entries(demoCounts).map(([table, count]) => `${table}: ${count}`).join(" | ")
              : "Open Demo Data to seed or refresh the mock JDE procurement staging tables."}
          </p>
        </SectionCard>
      </div>

      <div className="dashboard-split">
        <article className="status-panel">
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

        <article className="status-panel">
          <p className="panel-label">Backend API</p>
          <h2>Avenue MDP API</h2>
          <p className="table-name">{health?.service || "manufacturing-data-platform"}</p>
          <Badge tone={health ? "success" : "neutral"}>{health ? health.status : "unavailable"}</Badge>
        </article>
      </div>
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
  modelFilters,
  setModelFilters,
  saveDataModel,
  resetForm,
  drawerMode,
  viewModel,
  viewModelPreview,
  openCreateModel,
  closeDataModelDrawer,
  viewDataModel,
  editModel,
  previewDataModel,
  deactivateModel,
  activateModel,
  openModelInBrowser,
  updateAttribute,
  addAttribute,
  removeAttribute,
}) {
  const filteredModels = dataModels.filter((model) => {
    const searchText = (modelFilters.search || "").trim().toLowerCase();
    if (
      searchText &&
      ![
        model.display_name,
        model.name,
        model.domain,
        model.primary_key,
        getModelSource(model),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(searchText))
    ) {
      return false;
    }
    if (modelFilters.type !== "all" && model.type !== modelFilters.type) {
      return false;
    }
    if (modelFilters.status !== "all" && model.status !== modelFilters.status) {
      return false;
    }
    if (modelFilters.category !== "all" && (model.category || "") !== modelFilters.category) {
      return false;
    }
    if (modelFilters.domain !== "all" && (model.domain || "") !== modelFilters.domain) {
      return false;
    }
    if (modelFilters.source_layer !== "all" && (model.source_layer || "") !== modelFilters.source_layer) {
      return false;
    }
    if (modelFilters.canonical_status !== "all" && (model.canonical_status || "") !== modelFilters.canonical_status) {
      return false;
    }
    if (modelFilters.ai_enabled !== "all" && String(model.ai_enabled) !== modelFilters.ai_enabled) {
      return false;
    }
    return true;
  });

  return (
    <section className="page-stack">
      <section className="model-list table-panel">
        <div className="section-heading">
          <div>
            <p className="panel-label">Catalog</p>
            <h2>{filteredModels.length} data models</h2>
          </div>
          <button className="primary-button" type="button" onClick={openCreateModel}>
            New Data Model
          </button>
        </div>
        <div className="filter-bar data-model-filter-bar">
          <label className="filter-search">
            Search
            <input
              value={modelFilters.search || ""}
              onChange={(event) => setModelFilters({ ...modelFilters, search: event.target.value })}
              placeholder="Search models"
            />
          </label>
          <label>
            Type
            <select value={modelFilters.type} onChange={(event) => setModelFilters({ ...modelFilters, type: event.target.value })}>
              <option value="all">All</option>
              <option value="A">Type A</option>
              <option value="B">Type B</option>
            </select>
          </label>
          <label>
            Domain
            <select value={modelFilters.domain} onChange={(event) => setModelFilters({ ...modelFilters, domain: event.target.value })}>
              <option value="all">All</option>
              {domainOptions.filter(Boolean).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Source Layer
            <select value={modelFilters.source_layer} onChange={(event) => setModelFilters({ ...modelFilters, source_layer: event.target.value })}>
              <option value="all">All</option>
              {sourceLayerOptions.filter(Boolean).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Canonical Status
            <select value={modelFilters.canonical_status} onChange={(event) => setModelFilters({ ...modelFilters, canonical_status: event.target.value })}>
              <option value="all">All</option>
              {canonicalStatusOptions.filter(Boolean).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={modelFilters.status} onChange={(event) => setModelFilters({ ...modelFilters, status: event.target.value })}>
              <option value="all">All</option>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </label>
        </div>
        <div className="browser-results data-model-table-wrap">
          <table className="compact-table data-model-table">
            <colgroup>
              <col className="col-actions" />
              <col className="col-display" />
              <col className="col-name" />
              <col className="col-type" />
              <col className="col-domain" />
              <col className="col-source" />
              <col className="col-primary" />
              <col className="col-status" />
              <col className="col-canonical" />
              <col className="col-updated" />
            </colgroup>
            <thead>
              <tr>
                <th className="sticky-actions">Actions</th>
                <th>Display Name</th>
                <th>Name</th>
                <th>Type</th>
                <th>Domain</th>
                <th>Source / Generated Storage</th>
                <th>Primary Key</th>
                <th>Status</th>
                <th>Canonical</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredModels.map((model) => (
                <tr key={model.id}>
                  <td className="sticky-actions">
                    <div className="row-actions" aria-label={`Actions for ${model.name}`}>
                      <IconActionButton label="View" icon="eye" onClick={() => viewDataModel(model)} />
                      <IconActionButton label="Edit" icon="edit" onClick={() => editModel(model)} />
                      <IconActionButton label="Preview" icon="preview" onClick={() => previewDataModel(model)} />
                      {model.status === "inactive" ? (
                        <IconActionButton label="Activate" icon="activate" onClick={() => activateModel(model.id)} />
                      ) : (
                        <IconActionButton
                          label="Deactivate"
                          icon="deactivate"
                          onClick={() => deactivateModel(model.id)}
                          tone="danger"
                        />
                      )}
                    </div>
                  </td>
                  <td><EllipsisText value={model.display_name} /></td>
                  <td><EllipsisText value={model.name} className="table-name" /></td>
                  <td><Badge tone={badgeTone(model.type)}>Type {model.type}</Badge></td>
                  <td>{model.domain ? <Badge tone="neutral">{model.domain}</Badge> : "-"}</td>
                  <td><EllipsisText value={getModelSourceLabel(model)} className="table-name" /></td>
                  <td><EllipsisText value={model.primary_key || "-"} className="table-name" /></td>
                  <td><Badge tone={badgeTone(model.status)}>{model.status}</Badge></td>
                  <td>{model.canonical_status ? <Badge tone={badgeTone(model.canonical_status)}>{model.canonical_status}</Badge> : "-"}</td>
                  <td>{formatDateTime(model.updated_at || model.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {drawerMode && (
        <DataModelDrawer
          mode={drawerMode}
          model={viewModel || form}
          form={form}
          setForm={setForm}
          editingId={editingId}
          authHeaders={authHeaders}
          modelMessage={modelMessage}
          saveDataModel={saveDataModel}
          closeDataModelDrawer={closeDataModelDrawer}
          editModel={editModel}
          preview={viewModelPreview}
          updateAttribute={updateAttribute}
          addAttribute={addAttribute}
          removeAttribute={removeAttribute}
        />
      )}
    </section>
  );
}

function DataModelDrawer({
  mode,
  model,
  form,
  setForm,
  editingId,
  authHeaders,
  modelMessage,
  saveDataModel,
  closeDataModelDrawer,
  editModel,
  preview,
  updateAttribute,
  addAttribute,
  removeAttribute,
}) {
  const isView = mode === "view";
  const title = mode === "preview" ? "Preview Data Model" : isView ? "View Data Model" : mode === "edit" ? "Edit Data Model" : "Create Data Model";

  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-labelledby="data-model-drawer-title">
      <section className="drawer-panel">
        <header className="drawer-header">
          <div>
            <p className="panel-label">Data Models</p>
            <h2 id="data-model-drawer-title">{title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={closeDataModelDrawer} aria-label="Close data model dialog">
            X
          </button>
        </header>

        {isView || mode === "preview" ? (
          <>
            <div className="drawer-body">
              <DataModelReadOnly model={model} preview={preview} />
            </div>
            <footer className="drawer-footer">
              <button type="button" onClick={closeDataModelDrawer}>Close</button>
              <button className="primary-button" type="button" onClick={() => editModel(model)}>
                Edit Model
              </button>
            </footer>
          </>
        ) : (
          <form className="drawer-form" onSubmit={saveDataModel}>
            <div className="drawer-body">
              <DataModelEditor
                form={form}
                setForm={setForm}
                editingId={editingId}
                authHeaders={authHeaders}
                updateAttribute={updateAttribute}
                addAttribute={addAttribute}
                removeAttribute={removeAttribute}
              />
              {modelMessage && <p className="form-message">{modelMessage}</p>}
            </div>
            <footer className="drawer-footer">
              <button type="button" onClick={closeDataModelDrawer}>Cancel</button>
              <button className="primary-button" type="submit">
                {mode === "edit" ? "Save Changes" : "Save Model"}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}

function DataModelEditor({
  form,
  setForm,
  editingId,
  authHeaders,
  updateAttribute,
  addAttribute,
  removeAttribute,
}) {
  return (
    <div className="model-editor">
      <SectionCard title="Model Type" eyebrow="Model Behavior">
        <div className="type-selector">
          {[
            ["A", "Type A", "Receives flat JSON and creates a physical PostgreSQL table."],
            ["B", "Type B", "Links to an existing staging table or view."],
          ].map(([type, label, description]) => (
            <button
              className={form.type === type ? "type-card type-card--active" : "type-card"}
              key={type}
              type="button"
              onClick={() => {
                setForm({
                  ...form,
                  type,
                  source_layer: type === "A" ? form.source_layer || "generated_table" : form.source_layer,
                  attributes: form.attributes.map((attribute) => ({
                    ...attribute,
                    source_schema: type === "B" ? attribute.source_schema || "" : "",
                    source_table: type === "B" ? attribute.source_table || "" : "",
                    source_column: type === "B" ? attribute.source_column || "" : "",
                  })),
                });
              }}
            >
              <strong>{label}</strong>
              <span>{description}</span>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Basic Information" eyebrow={form.type === "B" ? "Linked Model" : "Ingested Model"}>
        <div className="form-grid">
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
            Name
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="invoice"
              required
            />
          </label>
        </div>

        <label>
          Description
          <textarea value={form.description || ""} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </label>

        {form.type === "B" && (
          <label>
            Business Definition
            <textarea value={form.business_definition || ""} onChange={(event) => setForm({ ...form, business_definition: event.target.value })} />
          </label>
        )}
      </SectionCard>

      <SectionCard title="Classification & Namespace" eyebrow="Catalog Metadata">
        <p className="helper-text">
          Namespace helps organize models for future data catalog, semantic search, IIoT hierarchy, and AI access.
        </p>
        <div className="form-grid">
          <label>
            Category
            <select value={form.category || ""} onChange={(event) => setForm({ ...form, category: event.target.value })}>
              {categoryOptions.map((option) => (
                <option key={option || "empty"} value={option}>{option || "Uncategorized"}</option>
              ))}
            </select>
          </label>
          <label>
            Domain
            <select value={form.domain || ""} onChange={(event) => setForm({ ...form, domain: event.target.value })}>
              {domainOptions.map((option) => (
                <option key={option || "empty"} value={option}>{option || "Infer from category"}</option>
              ))}
            </select>
          </label>
          <label>
            Entity Type
            <input
              value={form.entity_type || ""}
              onChange={(event) => setForm({ ...form, entity_type: event.target.value })}
              placeholder="supplier"
            />
          </label>
          <label>
            Business Process
            <select value={form.business_process || ""} onChange={(event) => setForm({ ...form, business_process: event.target.value })}>
              {businessProcessOptions.map((option) => (
                <option key={option || "empty"} value={option}>{option || "Unspecified"}</option>
              ))}
            </select>
          </label>
          <label>
            Namespace
            <input
              value={form.namespace || ""}
              onChange={(event) => setForm({ ...form, namespace: event.target.value })}
              placeholder="avenue.demo.procurement.supplier"
            />
          </label>
          <label>
            Source Layer
            <select value={form.source_layer || ""} onChange={(event) => setForm({ ...form, source_layer: event.target.value })}>
              {sourceLayerOptions.map((option) => (
                <option key={option || "empty"} value={option}>{option || "Infer from model/source"}</option>
              ))}
            </select>
          </label>
          <label>
            Canonical Status
            <select value={form.canonical_status || ""} onChange={(event) => setForm({ ...form, canonical_status: event.target.value })}>
              {canonicalStatusOptions.map((option) => (
                <option key={option || "empty"} value={option}>{option || "Default experimental"}</option>
              ))}
            </select>
          </label>
          <label>
            Site Scope
            <select value={form.site_scope || ""} onChange={(event) => setForm({ ...form, site_scope: event.target.value })}>
              {siteScopeOptions.map((option) => (
                <option key={option || "empty"} value={option}>{option || "Default enterprise"}</option>
              ))}
            </select>
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Ownership & Governance" eyebrow="Stewardship">
        <div className="form-grid">
          <label>
            Source System
            <select value={form.source_system || ""} onChange={(event) => setForm({ ...form, source_system: event.target.value })}>
              {sourceSystemOptions.map((option) => (
                <option key={option || "empty"} value={option}>{option || "Unspecified"}</option>
              ))}
            </select>
          </label>
          <label>
            Owner Department
            <select value={form.owner_department || ""} onChange={(event) => setForm({ ...form, owner_department: event.target.value })}>
              {ownerDepartmentOptions.map((option) => (
                <option key={option || "empty"} value={option}>{option || "Unassigned"}</option>
              ))}
            </select>
          </label>
          <label>
            Sensitivity
            <select value={form.sensitivity_level || "internal"} onChange={(event) => setForm({ ...form, sensitivity_level: event.target.value })}>
              {sensitivityOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Refresh Policy
            <input
              value={form.refresh_policy || ""}
              onChange={(event) => setForm({ ...form, refresh_policy: event.target.value })}
              placeholder="manual"
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
        </div>
      </SectionCard>

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
        <SectionCard
          title="Type A Attributes"
          eyebrow="Generated Table Schema"
          actions={<button type="button" onClick={addAttribute}>Add Attribute</button>}
        >
          <p className="helper-text">
            A PostgreSQL table will be generated automatically for Type A models.
          </p>
          {form.generated_table && <p className="table-name">{form.generated_table}</p>}
          <div className="form-grid compact-field-row">
            <label>
              Primary Key
              <input
                value={form.primary_key || ""}
                onChange={(event) => setForm({ ...form, primary_key: event.target.value })}
                placeholder="invoice_no"
              />
            </label>
          </div>
          <div className="attribute-list compact-attribute-list">
            {form.attributes.map((attribute, index) => (
              <div className="attribute-row attribute-row--compact" key={index}>
                <input
                  value={attribute.name}
                  onChange={(event) => updateAttribute(index, "name", event.target.value)}
                  placeholder="invoice_no"
                  required
                />
                <input
                  value={attribute.display_name || ""}
                  onChange={(event) => updateAttribute(index, "display_name", event.target.value)}
                  placeholder="Invoice Number"
                />
                <select value={attribute.data_type} onChange={(event) => updateAttribute(index, "data_type", event.target.value)}>
                  {dataTypeOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <label className="compact-check">
                  <input type="checkbox" checked={attribute.required} onChange={(event) => updateAttribute(index, "required", event.target.checked)} />
                  Required
                </label>
                <label className="compact-check">
                  <input type="checkbox" checked={attribute.is_primary_key} onChange={(event) => updateAttribute(index, "is_primary_key", event.target.checked)} />
                  PK
                </label>
                <button type="button" onClick={() => removeAttribute(index)}>Remove</button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function DataModelReadOnly({ model, preview }) {
  if (!model) {
    return <EmptyState message="Data model details are loading." />;
  }
  const sourceAttribute = model.attributes?.find((attribute) => attribute.source_schema && attribute.source_table);

  return (
    <div className="model-editor">
      <SectionCard title="Overview" eyebrow={model.display_name || model.name}>
        <div className="detail-grid">
          <div><span>Display Name</span><strong>{model.display_name || "-"}</strong></div>
          <div><span>Name</span><strong className="table-name">{model.name}</strong></div>
          <div><span>Type</span><strong><Badge tone={badgeTone(model.type)}>Type {model.type}</Badge></strong></div>
          <div><span>Status</span><strong><Badge tone={badgeTone(model.status)}>{model.status || "-"}</Badge></strong></div>
          <div><span>Primary Key</span><strong className="table-name">{model.primary_key || "-"}</strong></div>
        </div>
        {model.description && <p className="helper-text">{model.description}</p>}
      </SectionCard>

      <SectionCard title="Classification" eyebrow="Catalog Metadata">
        <div className="detail-grid">
          <div><span>Category</span><strong>{model.category || "-"}</strong></div>
          <div><span>Domain</span><strong>{model.domain ? <Badge tone="neutral">{model.domain}</Badge> : "-"}</strong></div>
          <div><span>Entity Type</span><strong>{model.entity_type || "-"}</strong></div>
          <div><span>Business Process</span><strong>{model.business_process || "-"}</strong></div>
          <div><span>Canonical Status</span><strong>{model.canonical_status ? <Badge tone={badgeTone(model.canonical_status)}>{model.canonical_status}</Badge> : "-"}</strong></div>
          <div><span>Site Scope</span><strong>{model.site_scope || "-"}</strong></div>
          <div className="detail-grid__wide"><span>Namespace</span><strong className="table-name">{model.namespace || "-"}</strong></div>
        </div>
      </SectionCard>

      <SectionCard title="Ownership & Governance" eyebrow="Stewardship">
        <div className="detail-grid">
          <div><span>Source System</span><strong>{model.source_system || "-"}</strong></div>
          <div><span>Owner Department</span><strong>{model.owner_department || "-"}</strong></div>
          <div><span>Sensitivity</span><strong>{model.sensitivity_level || "-"}</strong></div>
          <div><span>Source Layer</span><strong>{model.source_layer ? <Badge tone="info">{model.source_layer}</Badge> : "-"}</strong></div>
          <div><span>AI Enabled</span><strong>{String(model.ai_enabled)}</strong></div>
          <div><span>Refresh Policy</span><strong>{model.refresh_policy || "-"}</strong></div>
        </div>
      </SectionCard>

      <SectionCard title="Storage / Source" eyebrow={model.type === "A" ? "Generated Table" : "Linked Source"}>
        <div className="detail-grid">
          {model.type === "A" ? (
            <div className="detail-grid__wide"><span>Generated Table</span><strong className="table-name">{model.generated_table || "-"}</strong></div>
          ) : (
            <>
              <div><span>Source Schema</span><strong className="table-name">{model.source_schema || sourceAttribute?.source_schema || "-"}</strong></div>
              <div><span>Source Table / View</span><strong className="table-name">{model.source_table || sourceAttribute?.source_table || "-"}</strong></div>
            </>
          )}
        </div>
        <div className="endpoint-grid">
          {model.type === "A" && <p className="table-name">POST /inbound/{model.name}</p>}
          <p className="table-name">GET /outbound/{model.name}</p>
          <p className="table-name">GET /outbound/{model.name}/{model.primary_key || "primary_key_value"}</p>
        </div>
      </SectionCard>

      <SectionCard title="Attributes" eyebrow="Schema">
        <div className="browser-results compact-table-wrap">
          <table className="compact-table">
            <thead>
              <tr>
                <th>Attribute Name</th>
                <th>Display Name</th>
                <th>Data Type</th>
                {model.type === "B" && <th>Source Column</th>}
                <th>Required</th>
                <th>Primary Key</th>
                <th>Sensitivity</th>
              </tr>
            </thead>
            <tbody>
              {(model.attributes || []).map((attribute) => (
                <tr key={attribute.name}>
                  <td><EllipsisText value={attribute.name} className="table-name" /></td>
                  <td><EllipsisText value={attribute.display_name || "-"} /></td>
                  <td><Badge tone="neutral">{attribute.data_type}</Badge></td>
                  {model.type === "B" && <td><EllipsisText value={attribute.source_column || "-"} className="table-name" /></td>}
                  <td>{attribute.required ? "Yes" : "No"}</td>
                  <td>{attribute.is_primary_key ? "Yes" : "No"}</td>
                  <td>{attribute.sensitivity || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {(model.type === "B" || preview?.rows?.length > 0) && (
        <SectionCard title={model.type === "B" ? "Mapped Preview" : "Preview"} eyebrow={model.type === "B" ? "Type B" : "Type A"}>
          <p className="helper-text">
            Preview rows use governed model attribute names.
          </p>
          <div className="browser-results compact-table-wrap">
            {preview?.rows?.length > 0 ? (
              <table className="compact-table">
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
              <EmptyState message="No mapped preview rows loaded for this model." />
            )}
          </div>
        </SectionCard>
      )}
    </div>
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
                {table.table_name} - {table.table_type}
              </option>
            ))}
          </select>
        </label>
        <label>
          Primary Key Attribute
          <select
            value={form.primary_key || ""}
            onChange={(event) => {
              const primaryKey = event.target.value;
              setForm({
                ...form,
                primary_key: primaryKey,
                attributes: form.attributes.map((attribute) => ({
                  ...attribute,
                  is_primary_key: attribute.name === primaryKey,
                })),
              });
            }}
          >
            <option value="">Select primary key</option>
            {form.attributes.filter((attribute) => attribute.name).map((attribute) => (
              <option key={attribute.name} value={attribute.name}>{attribute.name}</option>
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
          <span>Primary Key</span>
          <span>Required</span>
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
            <button type="button" onClick={() => removeAttribute(index)}>
              Remove
            </button>
          </div>
        ))}
      </div>

      <p className="helper-text">
        Source columns are mapped to data model attributes. Attribute names may differ from source column names.
      </p>
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
  dataModels,
  filters,
  setFilters,
  expandedTransactionId,
  setExpandedTransactionId,
}) {
  const modelById = Object.fromEntries(dataModels.map((model) => [model.id, model]));
  const filteredTransactions = transactions.filter((transaction) => {
    const modelName = modelById[transaction.data_model_id]?.name || "";
    const searchText = (filters.search || "").trim().toLowerCase();
    if (
      searchText &&
      ![
        transaction.endpoint,
        transaction.error_message,
        transaction.source_system,
        transaction.auth_type,
        transaction.status,
        transaction.direction,
        modelName,
        transaction.data_model_id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(searchText))
    ) {
      return false;
    }
    if (filters.direction !== "all" && transaction.direction !== filters.direction) {
      return false;
    }
    if (filters.protocol !== "all" && transaction.protocol !== filters.protocol) {
      return false;
    }
    if (filters.status !== "all" && transaction.status !== filters.status) {
      return false;
    }
    if (filters.data_model_id !== "all" && transaction.data_model_id !== filters.data_model_id) {
      return false;
    }
    if (filters.auth_type !== "all" && transaction.auth_type !== filters.auth_type) {
      return false;
    }
    return true;
  });
  const successCount = filteredTransactions.filter((transaction) => transaction.status === "success").length;
  const failedCount = filteredTransactions.filter((transaction) => transaction.status === "failed").length;
  const inboundCount = filteredTransactions.filter((transaction) => transaction.direction === "inbound").length;
  const outboundCount = filteredTransactions.filter((transaction) => transaction.direction === "outbound").length;

  return (
    <section className="transactions-panel">
      <div className="transaction-summary-grid">
        <article>
          <span>{filteredTransactions.length}</span>
          <small>Visible transactions</small>
        </article>
        <article>
          <span>{successCount}</span>
          <small>Success</small>
        </article>
        <article>
          <span>{failedCount}</span>
          <small>Failed</small>
        </article>
        <article>
          <span>{inboundCount}</span>
          <small>Inbound</small>
        </article>
        <article>
          <span>{outboundCount}</span>
          <small>Outbound</small>
        </article>
      </div>

      <SectionCard title="Filters" eyebrow="Transaction Monitoring">
        <div className="filter-bar transaction-filter-bar">
          <label className="filter-search">
            Search
            <input
              value={filters.search || ""}
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
              placeholder="Endpoint, model, error, source"
            />
          </label>
          <label>
            Direction
            <select value={filters.direction} onChange={(event) => setFilters({ ...filters, direction: event.target.value })}>
              <option value="all">All</option>
              <option value="inbound">inbound</option>
              <option value="outbound">outbound</option>
            </select>
          </label>
          <label>
            Status
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="all">All</option>
              <option value="success">success</option>
              <option value="failed">failed</option>
            </select>
          </label>
          <label>
            Data Model
            <select value={filters.data_model_id} onChange={(event) => setFilters({ ...filters, data_model_id: event.target.value })}>
              <option value="all">All</option>
              {dataModels.map((model) => (
                <option key={model.id} value={model.id}>{model.display_name} ({model.name})</option>
              ))}
            </select>
          </label>
          <label>
            Auth Type
            <select value={filters.auth_type} onChange={(event) => setFilters({ ...filters, auth_type: event.target.value })}>
              <option value="all">All</option>
              <option value="jwt">jwt</option>
              <option value="api_key">api_key</option>
            </select>
          </label>
          <label>
            Protocol
            <select value={filters.protocol} onChange={(event) => setFilters({ ...filters, protocol: event.target.value })}>
              <option value="all">All</option>
              <option value="rest">rest</option>
              <option value="mqtt">mqtt</option>
            </select>
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Transaction Log" eyebrow={`${filteredTransactions.length} records`}>
        <div className="browser-results transaction-table-wrap">
          <table className="compact-table transaction-table">
            <colgroup>
              <col className="col-expand" />
              <col className="col-time" />
              <col className="col-direction" />
              <col className="col-endpoint" />
              <col className="col-model" />
              <col className="col-auth" />
              <col className="col-source" />
              <col className="col-status" />
              <col className="col-error" />
            </colgroup>
            <thead>
              <tr>
                <th>Detail</th>
                <th>Time</th>
                <th>Direction</th>
                <th>Endpoint</th>
                <th>Model</th>
                <th>Auth</th>
                <th>Source</th>
                <th>Status</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((transaction) => {
                const isExpanded = expandedTransactionId === transaction.id;
                const modelName = modelById[transaction.data_model_id]?.name || transaction.data_model_id || "-";
                return (
                  <Fragment key={transaction.id}>
                    <tr>
                      <td>
                        <button
                          className="transaction-expand-button"
                          type="button"
                          onClick={() => setExpandedTransactionId(isExpanded ? null : transaction.id)}
                          title={isExpanded ? "Hide details" : "Show details"}
                          aria-label={isExpanded ? "Hide transaction details" : "Show transaction details"}
                        >
                          {isExpanded ? "-" : "+"}
                        </button>
                      </td>
                      <td>{formatDateTime(transaction.created_at)}</td>
                      <td><Badge tone={badgeTone(transaction.direction)}>{transaction.direction}</Badge></td>
                      <td><EllipsisText value={transaction.endpoint || "-"} className="table-name" /></td>
                      <td><EllipsisText value={modelName} className="table-name" /></td>
                      <td>{transaction.auth_type ? <Badge tone={badgeTone(transaction.auth_type)}>{transaction.auth_type}</Badge> : "-"}</td>
                      <td><EllipsisText value={transaction.source_system || "-"} /></td>
                      <td><Badge tone={badgeTone(transaction.status)}>{transaction.status}</Badge></td>
                      <td><EllipsisText value={transaction.error_message || "-"} /></td>
                    </tr>
                    {isExpanded && (
                      <tr className="transaction-detail-row">
                        <td colSpan="9">
                          <div className="transaction-detail-grid">
                            <div>
                              <span>Data Model ID</span>
                              <strong className="table-name">{transaction.data_model_id || "-"}</strong>
                            </div>
                            <div>
                              <span>Protocol</span>
                              <strong>{transaction.protocol || "-"}</strong>
                            </div>
                            <div>
                              <span>Source System</span>
                              <strong>{transaction.source_system || "-"}</strong>
                            </div>
                          </div>
                          <div className="payload-grid">
                            <section>
                              <p className="panel-label">Request Payload</p>
                              <pre>{formatJson(transaction.request_payload)}</pre>
                            </section>
                            <section>
                              <p className="panel-label">Response Payload</p>
                              <pre>{formatJson(transaction.response_payload)}</pre>
                            </section>
                            <section>
                              <p className="panel-label">Error</p>
                              <pre>{transaction.error_message || "-"}</pre>
                            </section>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {filteredTransactions.length === 0 && <EmptyState message="No transactions match the current filters." />}
        </div>
      </SectionCard>
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
  filterField,
  setFilterField,
  filterValue,
  setFilterValue,
  appliedFilters,
  addFilter,
  removeFilter,
  clearFilters,
  lookupKey,
  setLookupKey,
  lookupRecord,
  records,
  message,
  loadRecords,
  loadRecordByKey,
}) {
  const selected = models.find((model) => model.name === selectedModel);
  const attributes = getModelAttributes(selected);
  const fields = records.length > 0 ? Object.keys(records[0]) : [];
  const lookupFields = lookupRecord ? Object.keys(lookupRecord) : [];

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
                {model.display_name} ({model.name}) - Type {model.type}
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
        <label>
          Filter Attribute
          <select value={filterField} onChange={(event) => setFilterField(event.target.value)}>
            <option value="">Select attribute</option>
            {attributes.map((attribute) => (
              <option key={attribute} value={attribute}>{attribute}</option>
            ))}
          </select>
        </label>
        <label>
          Filter Value
          <input
            value={filterValue}
            onChange={(event) => setFilterValue(event.target.value)}
            placeholder="VN"
          />
        </label>
        <button type="button" onClick={addFilter}>Add Filter</button>
        <button type="button" onClick={clearFilters}>Clear</button>
        <button type="submit">Load Records</button>
      </form>

      {selected && (
        <div className="browser-endpoints model-form">
          <div className="section-heading">
            <div>
              <p className="panel-label">Outbound API</p>
              <h2>{selected.display_name}</h2>
            </div>
            <Badge tone={badgeTone(selected.type)}>Type {selected.type}</Badge>
          </div>
          <p className="table-name">Primary key: {selected.primary_key || "-"}</p>
          <p className="table-name">GET /outbound/{selected.name}</p>
          <p className="table-name">GET /outbound/{selected.name}/{selected.primary_key || "primary_key_value"}</p>
          {selected.type === "B" && <p className="table-name">Source: {getModelSource(selected)}</p>}
          {appliedFilters.length > 0 && (
            <div className="filter-chips">
              {appliedFilters.map((filter) => (
                <button key={filter.field} type="button" onClick={() => removeFilter(filter.field)}>
                  {filter.field}={filter.value} x
                </button>
              ))}
            </div>
          )}
          <form className="lookup-row" onSubmit={loadRecordByKey}>
            <label>
              Lookup by key
              <input
                value={lookupKey}
                onChange={(event) => setLookupKey(event.target.value)}
                placeholder={selected.primary_key || "primary key value"}
              />
            </label>
            <button type="submit">Lookup</button>
          </form>
        </div>
      )}

      {message && <p className="form-message">{message}</p>}

      {lookupRecord && (
        <div className="browser-results">
          <table>
            <thead>
              <tr>
                {lookupFields.map((field) => (
                  <th key={field}>{field}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {lookupFields.map((field) => (
                  <td key={field}>{JSON.stringify(lookupRecord[field])}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

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
  dataModels,
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

  function toggleAllowedModel(modelName) {
    const next = form.allowed_models.includes(modelName)
      ? form.allowed_models.filter((item) => item !== modelName)
      : [...form.allowed_models, modelName];
    setForm({ ...form, allowed_models: next });
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
            <select value={form.source_system} onChange={(event) => setForm({ ...form, source_system: event.target.value })}>
              {apiKeySourceSystems.map((option) => (
                <option key={option || "empty"} value={option}>{option || "Unspecified"}</option>
              ))}
            </select>
          </label>
          <label>
            Access Scope
            <select
              value={form.allowed_model_scope}
              onChange={(event) =>
                setForm({
                  ...form,
                  allowed_model_scope: event.target.value,
                  allowed_models: event.target.value === "all" ? [] : form.allowed_models,
                })
              }
            >
              <option value="all">All Models</option>
              <option value="selected">Selected Models</option>
            </select>
          </label>
          <label>
            Expires At
            <input type="datetime-local" value={form.expires_at} onChange={(event) => setForm({ ...form, expires_at: event.target.value })} />
          </label>
          <label>
            Status
            <select value={form.is_active ? "active" : "inactive"} onChange={(event) => setForm({ ...form, is_active: event.target.value === "active" })}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
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
        </div>
        {form.allowed_model_scope === "selected" && (
          <div className="multi-select-panel">
            <p className="panel-label">Allowed Models</p>
            {dataModels.filter((model) => model.status === "active").map((model) => (
              <label className="compact-check" key={model.id}>
                <input
                  type="checkbox"
                  checked={form.allowed_models.includes(model.name)}
                  onChange={() => toggleAllowedModel(model.name)}
                />
                {model.display_name} ({model.name}) - Type {model.type}
              </label>
            ))}
          </div>
        )}
        <button className="primary-button" type="submit">{editingId ? "Update API Key" : "Create API Key"}</button>
        {createdPlainApiKey && (
          <div className="secret-panel alert alert--warning">
            <p>This API key will only be shown once. Please copy and store it securely.</p>
            <code>{createdPlainApiKey}</code>
          </div>
        )}
        {message && <p className="form-message">{message}</p>}
      </form>

      <SectionCard title="Issued API Keys" eyebrow="External Access" className="table-panel">
        <div className="browser-results">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Source System</th>
                <th>Directions</th>
                <th>Allowed Models</th>
                <th>Status</th>
                <th>Expires At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map((apiKey) => (
                <tr key={apiKey.id}>
                  <td>
                    <strong>{apiKey.name}</strong>
                    <p className="table-name">{apiKey.key_prefix}</p>
                  </td>
                  <td>{apiKey.source_system || "-"}</td>
                  <td>{apiKey.allowed_directions.map((direction) => <Badge key={direction} tone={badgeTone(direction)}>{direction}</Badge>)}</td>
                  <td>{apiKey.allowed_models?.join(", ") || "all models"}</td>
                  <td><Badge tone={apiKey.is_active ? "success" : "danger"}>{apiKey.is_active ? "active" : "inactive"}</Badge></td>
                  <td>{apiKey.expires_at ? new Date(apiKey.expires_at).toLocaleString() : "-"}</td>
                  <td>
                    <div className="inline-actions">
                      <button type="button" onClick={() => editApiKey(apiKey)}>Edit</button>
                      <button type="button" onClick={() => deactivateApiKey(apiKey.id)} disabled={!apiKey.is_active}>Deactivate</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {apiKeys.length === 0 && <EmptyState message="No API keys created yet." />}
        </div>
      </SectionCard>
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
              <p>
                <Badge tone="neutral">{connection.type}</Badge>
                <Badge tone={badgeTone(connection.status)}>{connection.status}</Badge>
              </p>
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
  onLoadData,
  onRefresh,
}) {
  const [activeTab, setActiveTab] = useState("columns");
  const [showRawColumns, setShowRawColumns] = useState(false);
  const selectedTableInfo = tables.find((table) => table.table_name === selectedTable);
  const hiddenPreviewColumns = new Set(["raw_payload"]);
  const visiblePreviewColumns = (preview.columns || []).filter((column) =>
    showRawColumns ? true : !hiddenPreviewColumns.has(column),
  );
  const visibleColumns = columns.filter((column) =>
    showRawColumns ? true : !hiddenPreviewColumns.has(column.column_name),
  );
  const oversizedColumnCount = (preview.columns || []).length - visiblePreviewColumns.length;

  return (
    <section className="db-browser-panel">
      <section className="db-browser-toolbar">
        <label>
          Schema
          <select value={selectedSchema} onChange={(event) => onSchemaChange(event.target.value)}>
            {schemas.map((schema) => (
              <option key={schema} value={schema}>{schema}</option>
            ))}
          </select>
        </label>
        <label>
          Table / View
          <select value={selectedTable} onChange={(event) => onTableSelect(event.target.value)}>
            {tables.map((table) => (
              <option key={table.table_name} value={table.table_name}>
                {table.table_name} - {table.table_type}
              </option>
            ))}
          </select>
        </label>
        {selectedTableInfo && <Badge tone={badgeTone(selectedTableInfo.table_type)}>{selectedTableInfo.table_type}</Badge>}
        <label className="compact-check db-raw-toggle">
          <input
            type="checkbox"
            checked={showRawColumns}
            onChange={(event) => setShowRawColumns(event.target.checked)}
          />
          Show raw columns
        </label>
        <button type="button" onClick={onRefresh}>Refresh</button>
        <button className="primary-button" type="button" onClick={onLoadData} disabled={!selectedSchema || !selectedTable}>
          Load Data
        </button>
      </section>

      {message && <p className="form-message">{message}</p>}
      {isLoading && <p className="form-message">Loading database metadata...</p>}

      <section className="db-object-summary">
        <div><span>Schema</span><strong className="table-name">{selectedSchema || "-"}</strong></div>
        <div><span>Object</span><strong className="table-name">{selectedTable || "-"}</strong></div>
        <div><span>Type</span><strong>{selectedTableInfo ? <Badge tone={badgeTone(selectedTableInfo.table_type)}>{selectedTableInfo.table_type}</Badge> : "-"}</strong></div>
        <div><span>Columns</span><strong>{visibleColumns.length}{oversizedColumnCount > 0 ? ` shown, ${oversizedColumnCount} hidden` : ""}</strong></div>
        <div><span>Preview Rows</span><strong>{preview.rows?.length || 0}</strong></div>
      </section>

      <section className="db-content-panel">
        <div className="tab-bar">
          <button
            className={activeTab === "columns" ? "tab-button tab-button--active" : "tab-button"}
            type="button"
            onClick={() => setActiveTab("columns")}
          >
            Columns
          </button>
          <button
            className={activeTab === "preview" ? "tab-button tab-button--active" : "tab-button"}
            type="button"
            onClick={() => setActiveTab("preview")}
          >
            Preview
          </button>
        </div>

        {activeTab === "columns" ? (
          <div className="browser-results compact-table-wrap">
            <table className="compact-table db-metadata-table">
              <thead>
                <tr>
                  <th>Column</th>
                  <th>Type</th>
                  <th>Nullable</th>
                  <th>Default</th>
                </tr>
              </thead>
              <tbody>
                {visibleColumns.map((column) => (
                  <tr key={column.column_name}>
                    <td><EllipsisText value={column.column_name} className="table-name" /></td>
                    <td><EllipsisText value={column.data_type} /></td>
                    <td>{column.is_nullable}</td>
                    <td><EllipsisText value={column.column_default || "-"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleColumns.length === 0 && <EmptyState message="Click Load Data to inspect columns for the selected object." />}
          </div>
        ) : (
          <div className="browser-results db-preview-wrap">
            {preview.rows?.length > 0 && visiblePreviewColumns.length > 0 ? (
              <table className="compact-table db-preview-table">
                <thead>
                  <tr>
                    {visiblePreviewColumns.map((column) => (
                      <th key={column} title={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, index) => (
                    <tr key={index}>
                      {visiblePreviewColumns.map((column) => (
                        <td key={column}>
                          <EllipsisText value={JSON.stringify(row[column])} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState message="Click Load Data to preview rows for the selected object." />
            )}
          </div>
        )}
      </section>
    </section>
  );
}

const emptyUserForm = {
  username: "",
  email: "",
  full_name: "",
  role: "viewer",
  password: "",
  is_active: true,
};

function roleLabel(role) {
  return roleOptions.find(([value]) => value === role)?.[1] || role || "-";
}

function UsersPage({ users, currentUser, authHeaders, message, setMessage, loadUsers }) {
  const [drawerMode, setDrawerMode] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [form, setForm] = useState(emptyUserForm);
  const [passwordForm, setPasswordForm] = useState({ new_password: "", confirm_password: "" });
  const [errors, setErrors] = useState({});
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");

  const filteredUsers = users.filter((user) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      [user.username, user.email, user.full_name]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" ? user.is_active : !user.is_active);
    return matchesSearch && matchesRole && matchesStatus;
  });

  function closeDrawer() {
    setDrawerMode(null);
    setSelectedUser(null);
    setForm(emptyUserForm);
    setPasswordForm({ new_password: "", confirm_password: "" });
    setErrors({});
  }

  function openCreateUser() {
    setMessage("");
    setSelectedUser(null);
    setForm(emptyUserForm);
    setErrors({});
    setDrawerMode("create");
  }

  function openViewUser(user) {
    setMessage("");
    setSelectedUser(user);
    setDrawerMode("view");
  }

  function openEditUser(user) {
    setMessage("");
    setSelectedUser(user);
    setForm({
      username: user.username,
      email: user.email,
      full_name: user.full_name || "",
      role: user.role || "viewer",
      password: "",
      is_active: user.is_active,
    });
    setErrors({});
    setDrawerMode("edit");
  }

  function openResetPassword(user) {
    setMessage("");
    setSelectedUser(user);
    setPasswordForm({ new_password: "", confirm_password: "" });
    setErrors({});
    setDrawerMode("reset-password");
  }

  function validateUserForm(isCreate) {
    const nextErrors = {};
    if (isCreate && !form.username.trim()) {
      nextErrors.username = "Username is required.";
    }
    if (!form.email.trim() || !form.email.includes("@")) {
      nextErrors.email = "A valid email is required.";
    }
    if (!form.role) {
      nextErrors.role = "Role is required.";
    }
    if (isCreate && !form.password.trim()) {
      nextErrors.password = "Password is required.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function saveUser(event) {
    event.preventDefault();
    const isCreate = drawerMode === "create";
    if (!validateUserForm(isCreate)) {
      return;
    }
    const payload = isCreate
      ? {
          username: form.username.trim(),
          email: form.email.trim(),
          full_name: form.full_name.trim() || null,
          role: form.role,
          password: form.password,
          is_active: form.is_active,
        }
      : {
          email: form.email.trim(),
          full_name: form.full_name.trim() || null,
          role: form.role,
          is_active: form.is_active,
        };
    try {
      const response = await fetch(
        isCreate ? `${API_BASE_URL}/users` : `${API_BASE_URL}/users/${selectedUser.id}`,
        {
          method: isCreate ? "POST" : "PUT",
          headers: authHeaders,
          body: JSON.stringify(payload),
        },
      );
      const detail = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(formatApiDetail(detail?.detail));
      }
      await loadUsers();
      closeDrawer();
      setMessage(isCreate ? "User created." : "User updated.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to save user");
    }
  }

  async function setUserActive(user, isActive) {
    if (!isActive && user.id === currentUser?.id) {
      setMessage("You cannot deactivate your own account.");
      return;
    }
    if (!isActive && !window.confirm("Deactivate this user? They will no longer be able to log in.")) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/users/${user.id}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ is_active: isActive }),
      });
      const detail = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(formatApiDetail(detail?.detail));
      }
      await loadUsers();
      setMessage(isActive ? "User activated." : "User deactivated.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to update user status");
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!passwordForm.new_password || passwordForm.new_password.length < 6) {
      nextErrors.new_password = "Password must be at least 6 characters.";
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      nextErrors.confirm_password = "Passwords do not match.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/users/${selectedUser.id}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ password: passwordForm.new_password }),
      });
      const detail = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(formatApiDetail(detail?.detail));
      }
      closeDrawer();
      setMessage("Password reset.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to reset password");
    }
  }

  return (
    <section className="browser-panel">
      <SectionCard
        title="User Management"
        eyebrow="Access"
        actions={
          <>
            <button type="button" onClick={loadUsers}>Refresh</button>
            <button className="primary-button" type="button" onClick={openCreateUser}>New User</button>
          </>
        }
      >
        <p className="helper-text">
          Human users authenticate with JWT. Roles are basic labels for now; fine-grained RBAC will be added later.
        </p>
        {message && <p className="form-message">{message}</p>}
      </SectionCard>

      <section className="model-list table-panel">
        <div className="section-heading">
          <div>
            <p className="panel-label">Directory</p>
            <h2>{filteredUsers.length} users</h2>
          </div>
        </div>
        <div className="filter-bar">
          <label>
            Search
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="username, email, name" />
          </label>
          <label>
            Role
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="all">All roles</option>
              {roleOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </select>
          </label>
        </div>

        <div className="browser-results">
          <table>
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>{user.full_name || "-"}</td>
                  <td>{user.username}</td>
                  <td>{user.email}</td>
                  <td><Badge tone="neutral">{roleLabel(user.role)}</Badge></td>
                  <td><Badge tone={user.is_active ? "success" : "danger"}>{user.is_active ? "Active" : "Inactive"}</Badge></td>
                  <td>{new Date(user.created_at).toLocaleString()}</td>
                  <td>
                    <div className="row-actions">
                      <IconActionButton label="View" icon="eye" onClick={() => openViewUser(user)} />
                      <IconActionButton label="Edit" icon="edit" onClick={() => openEditUser(user)} />
                      {user.is_active ? (
                        <IconActionButton
                          label={user.id === currentUser?.id ? "Cannot deactivate own account" : "Deactivate"}
                          icon="deactivate"
                          onClick={() => setUserActive(user, false)}
                          disabled={user.id === currentUser?.id}
                          tone="danger"
                        />
                      ) : (
                        <IconActionButton label="Activate" icon="deactivate" onClick={() => setUserActive(user, true)} />
                      )}
                      <IconActionButton label="Reset Password" icon="key" onClick={() => openResetPassword(user)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 && <EmptyState message="No users match the current filters." />}
        </div>
      </section>

      {drawerMode && (
        <UserDrawer
          mode={drawerMode}
          user={selectedUser}
          form={form}
          setForm={setForm}
          passwordForm={passwordForm}
          setPasswordForm={setPasswordForm}
          errors={errors}
          closeDrawer={closeDrawer}
          openEditUser={openEditUser}
          saveUser={saveUser}
          resetPassword={resetPassword}
        />
      )}
    </section>
  );
}

function FieldError({ message }) {
  return message ? <span className="field-error">{message}</span> : null;
}

function UserDrawer({
  mode,
  user,
  form,
  setForm,
  passwordForm,
  setPasswordForm,
  errors,
  closeDrawer,
  openEditUser,
  saveUser,
  resetPassword,
}) {
  const isView = mode === "view";
  const isReset = mode === "reset-password";
  const title =
    mode === "create"
      ? "Create User"
      : mode === "edit"
        ? "Edit User"
        : isReset
          ? "Reset Password"
          : "View User";

  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-labelledby="user-drawer-title">
      <section className="drawer-panel drawer-panel--compact">
        <header className="drawer-header">
          <div>
            <p className="panel-label">Users</p>
            <h2 id="user-drawer-title">{title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={closeDrawer} aria-label="Close user dialog">X</button>
        </header>

        {isView && user && (
          <>
            <div className="drawer-body">
              <SectionCard title={user.full_name || user.username} eyebrow="User Details">
                <div className="detail-grid">
                  <div><span>Username</span><strong>{user.username}</strong></div>
                  <div><span>Email</span><strong>{user.email}</strong></div>
                  <div><span>Full Name</span><strong>{user.full_name || "-"}</strong></div>
                  <div><span>Role</span><strong><Badge tone="neutral">{roleLabel(user.role)}</Badge></strong></div>
                  <div><span>Status</span><strong><Badge tone={user.is_active ? "success" : "danger"}>{user.is_active ? "Active" : "Inactive"}</Badge></strong></div>
                  <div><span>Created</span><strong>{new Date(user.created_at).toLocaleString()}</strong></div>
                  <div><span>Updated</span><strong>{user.updated_at ? new Date(user.updated_at).toLocaleString() : "-"}</strong></div>
                </div>
              </SectionCard>
            </div>
            <footer className="drawer-footer">
              <button type="button" onClick={closeDrawer}>Close</button>
              <button className="primary-button" type="button" onClick={() => openEditUser(user)}>Edit User</button>
            </footer>
          </>
        )}

        {(mode === "create" || mode === "edit") && (
          <form className="drawer-form" onSubmit={saveUser}>
            <div className="drawer-body">
              <SectionCard title="Account Information" eyebrow={mode === "create" ? "New User" : "Edit User"}>
                <div className="form-grid">
                  <label>
                    Username
                    <input
                      value={form.username}
                      onChange={(event) => setForm({ ...form, username: event.target.value })}
                      readOnly={mode === "edit"}
                      required
                    />
                    <FieldError message={errors.username} />
                  </label>
                  <label>
                    Email
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm({ ...form, email: event.target.value })}
                      required
                    />
                    <FieldError message={errors.email} />
                  </label>
                  <label>
                    Full Name
                    <input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} />
                  </label>
                  <label>
                    Role
                    <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                      {roleOptions.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <FieldError message={errors.role} />
                  </label>
                  {mode === "create" && (
                    <label>
                      Password
                      <input
                        type="password"
                        value={form.password}
                        onChange={(event) => setForm({ ...form, password: event.target.value })}
                        required
                      />
                      <FieldError message={errors.password} />
                    </label>
                  )}
                  <label>
                    Status
                    <select value={form.is_active ? "active" : "inactive"} onChange={(event) => setForm({ ...form, is_active: event.target.value === "active" })}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                </div>
              </SectionCard>
            </div>
            <footer className="drawer-footer">
              <button type="button" onClick={closeDrawer}>Cancel</button>
              <button className="primary-button" type="submit">{mode === "create" ? "Create User" : "Save Changes"}</button>
            </footer>
          </form>
        )}

        {isReset && user && (
          <form className="drawer-form" onSubmit={resetPassword}>
            <div className="drawer-body">
              <SectionCard title="Reset Password" eyebrow="Credential Update">
                <p className="helper-text">
                  Reset password for {user.username} ({user.email}).
                </p>
                <div className="form-grid">
                  <label>
                    New Password
                    <input
                      type="password"
                      value={passwordForm.new_password}
                      onChange={(event) => setPasswordForm({ ...passwordForm, new_password: event.target.value })}
                      required
                    />
                    <FieldError message={errors.new_password} />
                  </label>
                  <label>
                    Confirm Password
                    <input
                      type="password"
                      value={passwordForm.confirm_password}
                      onChange={(event) => setPasswordForm({ ...passwordForm, confirm_password: event.target.value })}
                      required
                    />
                    <FieldError message={errors.confirm_password} />
                  </label>
                </div>
              </SectionCard>
            </div>
            <footer className="drawer-footer">
              <button type="button" onClick={closeDrawer}>Cancel</button>
              <button className="primary-button" type="submit">Reset Password</button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}

export default App;
