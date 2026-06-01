/**
 * Avenue MDP API client for the FastAPI backend.
 *
 * Local development sets NEXT_PUBLIC_API_URL=http://localhost:8000 and calls
 * backend root routes directly, such as /auth/login.
 *
 * Production leaves NEXT_PUBLIC_API_URL empty so the browser calls same-origin
 * /api/* routes. Caddy strips /api before forwarding to the backend.
 */
const configuredBase = process.env.NEXT_PUBLIC_API_URL?.trim();
export const API_BASE_URL =
  configuredBase && configuredBase !== "undefined"
    ? configuredBase.replace(/\/+$/, "")
    : "/api";

function canonicalBackendPath(path: string): string {
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  if (withSlash === "/api") return "/";
  if (withSlash.startsWith("/api/")) return withSlash.slice(4);
  return withSlash;
}

export function apiPath(path: string): string {
  const backendPath = canonicalBackendPath(path);
  return `${API_BASE_URL}${backendPath}`;
}

// Token storage
const TOKEN_KEY = "mdp_token";
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}
export function clearToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** FastAPI errors are `{detail: string}` or `{detail: [{msg,...}]}` (validation). */
function messageFromBody(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "detail" in data) {
    const d = (data as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      return d
        .map((e) => {
          if (typeof e === "string") return e;
          if (e && typeof e === "object" && "msg" in e)
            return String((e as { msg: unknown }).msg);
          return JSON.stringify(e);
        })
        .join("; ");
    }
  }
  return fallback;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new ApiError(
      res.status,
      messageFromBody(data, res.statusText || `HTTP ${res.status}`),
      data,
    );
  }
  return data as T;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  try {
    return await fetch(apiPath(path), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new ApiError(0, `Cannot reach backend (${API_BASE_URL}).`);
  }
}

// Auth
export type AuthUser = {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
};

type TokenResponse = { access_token: string; token_type: string };

/** POST /auth/login stores the JWT. Throws ApiError(401) on bad credentials. */
export async function authLogin(username: string, password: string): Promise<void> {
  const r = await req<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setToken(r.access_token);
}

export const authMe = () => req<AuthUser>("/auth/me");

/** MDP has no logout endpoint (stateless JWT) -> just drop the token. */
export function authLogout(): void {
  clearToken();
}

// Data Models
export type AttrType =
  | "text"
  | "integer"
  | "float"
  | "boolean"
  | "date"
  | "datetime"
  | "json";
export const ATTR_TYPES: AttrType[] = [
  "text",
  "integer",
  "float",
  "boolean",
  "date",
  "datetime",
  "json",
];

export type DataModelAttribute = {
  name: string;
  display_name?: string | null;
  data_type: AttrType;
  required?: boolean;
  is_primary_key?: boolean;
  // Type B mapping (one source table per model):
  source_schema?: string | null;
  source_table?: string | null;
  source_column?: string | null;
};

export type DataModel = {
  id: string;
  name: string;
  display_name: string | null;
  type: "A" | "B";
  description?: string | null;
  domain?: string | null;
  primary_key?: string | null;
  generated_table?: string | null;
  attributes: DataModelAttribute[];
  source_schema?: string | null; // computed (Type B)
  source_table?: string | null; // computed (Type B)
  status: string;
  created_at: string;
  updated_at: string;
};

export type DataModelCreate = {
  name: string;
  display_name?: string;
  type: "A" | "B";
  category?: string | null;
  description?: string | null;
  primary_key: string;
  attributes: DataModelAttribute[];
};

export const listDataModels = () => req<DataModel[]>("/data-models");
export const getDataModel = (id: string) => req<DataModel>(`/data-models/${id}`);
export const createDataModel = (body: DataModelCreate) =>
  req<DataModel>("/data-models", { method: "POST", body: JSON.stringify(body) });
export const updateDataModel = (id: string, body: Partial<DataModelCreate>) =>
  req<DataModel>(`/data-models/${id}`, { method: "PUT", body: JSON.stringify(body) });
/** Soft-deactivate (status=inactive); returns the model. */
export const deleteDataModel = (id: string) =>
  req<DataModel>(`/data-models/${id}`, { method: "DELETE" });

// DB Browser
export type DbTable = { table_name: string; table_type: string };
export type DbColumn = {
  column_name: string;
  data_type: string;
  is_nullable?: string;
  ordinal_position?: number;
};
export type DbPreview = {
  schema: string;
  table: string;
  limit: number;
  offset: number;
  count: number;
  columns: string[];
  rows: Record<string, unknown>[];
};

export const listSchemas = () =>
  req<{ schemas: string[] }>("/db-browser/schemas").then((r) => r.schemas);
export const listTables = (schema: string) =>
  req<{ schema: string; tables: DbTable[] }>(
    `/db-browser/schemas/${encodeURIComponent(schema)}/tables`,
  ).then((r) => r.tables);
export const listColumns = (schema: string, table: string) =>
  req<{ columns: DbColumn[] }>(
    `/db-browser/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/columns`,
  ).then((r) => r.columns);
export const previewTable = (schema: string, table: string, limit = 50) =>
  req<DbPreview>(
    `/db-browser/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/preview?limit=${limit}`,
  );

/** Map a raw Postgres data_type -> one of the 7 platform types (mirrors backend). */
export function normalizePgType(raw: string): AttrType {
  const t = (raw || "").toLowerCase().split("(")[0].trim();
  if (["text", "character varying", "varchar", "char", "character", "name", "citext"].includes(t))
    return "text";
  if (["integer", "int", "int4", "bigint", "int8", "smallint", "int2"].includes(t))
    return "integer";
  if (["numeric", "decimal", "double precision", "real", "float", "float4", "float8"].includes(t))
    return "float";
  if (["boolean", "bool"].includes(t)) return "boolean";
  if (t === "date") return "date";
  if (t.startsWith("timestamp")) return "datetime";
  if (["json", "jsonb"].includes(t)) return "json";
  return "text";
}

// Users
export type User = {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
export const USER_ROLES = ["admin", "data_engineer", "api_manager", "viewer"];

export const listUsers = () => req<User[]>("/users");
export const createUser = (body: {
  username: string;
  email: string;
  password: string;
  full_name?: string;
  role: string;
  is_active: boolean;
}) => req<User>("/users", { method: "POST", body: JSON.stringify(body) });
export const updateUser = (
  id: string,
  body: { email?: string; full_name?: string; role?: string; is_active?: boolean; password?: string },
) => req<User>(`/users/${id}`, { method: "PUT", body: JSON.stringify(body) });
export const deleteUser = (id: string) =>
  req<void>(`/users/${id}`, { method: "DELETE" });

// API Keys
export const API_DIRECTIONS = ["inbound", "outbound"] as const;
export type ApiKey = {
  id: string;
  name: string;
  description: string | null;
  key_prefix: string;
  source_system: string | null;
  allowed_directions: string[];
  allowed_models: string[] | null;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
};
export type ApiKeyCreated = ApiKey & { api_key: string };
export const listApiKeys = () => req<ApiKey[]>("/api-keys");
export const createApiKey = (body: {
  name: string;
  description?: string;
  source_system?: string;
  allowed_directions: string[];
  allowed_models?: string[] | null;
}) => req<ApiKeyCreated>("/api-keys", { method: "POST", body: JSON.stringify(body) });
export const updateApiKey = (
  id: string,
  body: { is_active?: boolean; name?: string; allowed_directions?: string[]; allowed_models?: string[] | null },
) => req<ApiKey>(`/api-keys/${id}`, { method: "PUT", body: JSON.stringify(body) });
/** Soft-deactivate. */
export const deleteApiKey = (id: string) =>
  req<ApiKey>(`/api-keys/${id}`, { method: "DELETE" });

// Connections
export const CONNECTION_TYPES = ["postgresql", "oracle", "sqlserver", "rest_api", "mqtt"] as const;
export type ConnType = (typeof CONNECTION_TYPES)[number];
export type Connection = {
  id: string;
  name: string;
  type: ConnType;
  description: string | null;
  host: string | null;
  port: number | null;
  database_name: string | null;
  username: string | null;
  base_url: string | null;
  mqtt_topic_prefix: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  last_test_status: string | null;
  last_test_message: string | null;
  last_test_at: string | null;
};
export type ConnectionTestResult = { id: string; status: string; message: string; tested_at: string };
export const listConnections = () => req<Connection[]>("/connections");
export const createConnection = (body: Record<string, unknown>) =>
  req<Connection>("/connections", { method: "POST", body: JSON.stringify(body) });
export const updateConnection = (id: string, body: Record<string, unknown>) =>
  req<Connection>(`/connections/${id}`, { method: "PUT", body: JSON.stringify(body) });
export const deleteConnection = (id: string) =>
  req<Connection>(`/connections/${id}`, { method: "DELETE" });
export const testConnection = (id: string) =>
  req<ConnectionTestResult>(`/connections/${id}/test`, { method: "POST" });

// Transactions
export type Transaction = {
  id: string;
  direction: string;
  protocol: string;
  data_model_id: string | null;
  endpoint: string | null;
  status: string;
  auth_type: string | null;
  source_system: string | null;
  error_message: string | null;
  created_at: string;
};
export const listTransactions = (
  params: { limit?: number; direction?: string; status?: string } = {},
) => {
  const q = new URLSearchParams();
  q.set("limit", String(params.limit ?? 100));
  if (params.direction) q.set("direction", params.direction);
  if (params.status) q.set("status", params.status);
  return req<Transaction[]>(`/transactions?${q.toString()}`);
};

// Inbound / Outbound
export type InboundResult = { status: string; model: string; record_id: string; message: string };
export const inbound = (model: string, payload: Record<string, unknown>) =>
  req<InboundResult>(`/inbound/${encodeURIComponent(model)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const outbound = (model: string, params: { limit?: number; include_meta?: boolean } = {}) => {
  const q = new URLSearchParams();
  q.set("limit", String(params.limit ?? 50));
  if (params.include_meta) q.set("include_meta", "true");
  return req<{ model?: string; count?: number; records?: Record<string, unknown>[] } & Record<string, unknown>>(
    `/outbound/${encodeURIComponent(model)}?${q.toString()}`,
  );
};

// Admin demo
export const procurementStagingSummary = () =>
  req<{ tables?: Record<string, number> } & Record<string, unknown>>(
    "/admin/demo/procurement-staging-summary",
  );
