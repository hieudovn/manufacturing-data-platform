# API Design

This milestone exposes health, authentication, user management, and data model metadata endpoints.

## Health Check

`GET /health`

Response:

```json
{
  "status": "ok",
  "service": "manufacturing-data-platform"
}
```

Future milestones will add APIs for data model management, inbound flat JSON ingestion, and outbound data access based on configured data models.

## Authentication

`POST /auth/login`

Request:

```json
{
  "username": "admin",
  "password": "admin123"
}
```

Response:

```json
{
  "access_token": "<token>",
  "token_type": "bearer"
}
```

`GET /auth/me`

Requires `Authorization: Bearer <token>`.

## Users

All user endpoints require a valid JWT for an active user.

- `POST /users`
- `GET /users`
- `GET /users/{id}`
- `PUT /users/{id}`
- `DELETE /users/{id}`

## Data Models

All data model endpoints require a valid JWT for an active user.

- `POST /data-models`
- `GET /data-models`
- `GET /data-models/{id}`
- `PUT /data-models/{id}`
- `DELETE /data-models/{id}`

`GET /data-models` supports simple filters:

- `status`
- `type`
- `ai_enabled`

`DELETE /data-models/{id}` is a soft delete that sets `status` to `inactive`.

When `POST /data-models` creates a Type A model, the response includes `generated_table`, such as `mdp_data.dm_invoice`. Type B model responses return `generated_table` as `null`.

## Dynamic Inbound

`POST /inbound/{model_name}`

Requires either a valid JWT for an active user or a scoped API key with `inbound` access.

Behavior:

- Finds the active data model by `model_name`.
- Accepts Type A models only.
- Validates the flat JSON request body against model attributes.
- Inserts mapped fields into `mdp_data.dm_{model_name}`.
- Stores the full original request body in `raw_payload`.
- Writes a transaction log.

Example:

```json
{
  "result_no": "QR-001",
  "item_code": "ITEM-1001",
  "batch_no": "BATCH-2026-001",
  "inspection_date": "2026-05-30",
  "result_value": 98.5,
  "passed": true
}
```

Response:

```json
{
  "status": "success",
  "model": "quality_result",
  "record_id": "...",
  "message": "Data received successfully"
}
```

Current limitations:

- Insert only; no upsert yet.
- JWT or scoped API key authentication is required.
- Type B inbound, MQTT, and schema evolution are not implemented yet.

## Dynamic Outbound

`GET /outbound/{model_name}`

Requires either a valid JWT for an active user or a scoped API key with `outbound` access.

Behavior:

- Finds the active data model by `model_name`.
- Accepts Type A models only.
- Selects only data model attribute columns by default.
- Supports `limit`, `offset`, `include_meta`, and `include_raw`.
- Supports simple equality filters on defined data model attributes.
- Writes an outbound transaction log.

List response:

```json
{
  "status": "success",
  "model": "quality_result",
  "count": 2,
  "limit": 100,
  "offset": 0,
  "data": [
    {
      "result_no": "QR-001",
      "item_code": "ITEM-1001",
      "batch_no": "BATCH-2026-001",
      "inspection_date": "2026-05-30",
      "result_value": 98.5,
      "passed": true
    }
  ]
}
```

`GET /outbound/{model_name}/{key}`

Uses the data model `primary_key` attribute as the lookup column.

By-key response:

```json
{
  "status": "success",
  "model": "quality_result",
  "key": "QR-001",
  "data": {
    "result_no": "QR-001",
    "item_code": "ITEM-1001"
  }
}
```

Security rules:

- JWT or scoped API key authentication is required.
- Users cannot submit SQL.
- Users cannot choose table names directly.
- Table names are derived only from active data model metadata.
- Filter fields must be defined model attributes.
- All filter values are bound SQL parameters.

Current limitations:

- Type A only. Type B outbound query mapping will be added later.
- JWT or API key authentication is supported.
- Equality filters only.
- AI semantic query layer is not implemented yet.

## API Keys

Human users use JWT bearer tokens. External systems can call inbound and outbound APIs with:

```text
X-API-Key: <api_key>
```

API key management endpoints require JWT:

- `POST /api-keys`
- `GET /api-keys`
- `GET /api-keys/{id}`
- `PUT /api-keys/{id}`
- `DELETE /api-keys/{id}`

API keys support:

- `allowed_directions`: `inbound`, `outbound`
- `allowed_models`: optional list of model names; null or empty allows all models
- `source_system`
- `expires_at`
- `is_active`

Security rules:

- Plain API keys are returned only once on create.
- Plain API keys are never stored.
- API responses never expose `hashed_key`.
- `DELETE /api-keys/{id}` deactivates the key.

Example inbound request:

```bash
curl -X POST http://localhost:8000/inbound/quality_result \
  -H "X-API-Key: <api_key>" \
  -H "Content-Type: application/json" \
  -d "{\"result_no\":\"QR-001\",\"result_value\":98.5,\"passed\":true}"
```

Example outbound request:

```bash
curl http://localhost:8000/outbound/quality_result/QR-001 \
  -H "X-API-Key: <api_key>"
```

## Transactions

Transaction APIs require a valid JWT:

- `GET /transactions`
- `GET /transactions/{id}`

`GET /transactions` supports filters:

- `direction`
- `protocol`
- `status`
- `data_model_id`
- `limit`
- `offset`

## Connections

Connection Manager endpoints require JWT authentication:

- `POST /connections`
- `GET /connections`
- `GET /connections/{id}`
- `PUT /connections/{id}`
- `DELETE /connections/{id}`
- `POST /connections/{id}/test`

Supported `type` values:

- `postgresql`
- `oracle`
- `sqlserver`
- `rest_api`
- `mqtt`

`GET /connections` supports filters:

- `type`
- `status`

Security rules:

- Passwords are encrypted before storage.
- API responses never return `password` or `encrypted_password`.
- `DELETE /connections/{id}` is a soft delete that sets `status` to `inactive`.

Testing behavior:

- PostgreSQL runs `SELECT 1`.
- REST API sends `GET` to `base_url` with a timeout.
- Oracle returns a clear unavailable-driver message when `python-oracledb` is missing or not configured.
- SQL Server returns a clear unavailable-driver message when `pyodbc` or an ODBC driver is missing.
- MQTT validates metadata only in this milestone.

## Demo Procurement Staging

Demo staging endpoints require JWT authentication:

- `POST /admin/demo/seed-procurement-staging`
- `GET /admin/demo/procurement-staging-summary`

`POST /admin/demo/seed-procurement-staging` safely creates and reseeds mock JDE procurement staging tables. The operation is idempotent and returns deterministic row counts:

```json
{
  "status": "success",
  "message": "Procurement staging data seeded successfully",
  "tables": {
    "stg_jde_supplier": 5,
    "stg_jde_po_header": 5,
    "stg_jde_po_line": 5,
    "stg_jde_po_receipt": 3,
    "stg_jde_ap_invoice": 5
  }
}
```

These endpoints do not implement Oracle sync, Type B query mapping, or table browsing.
