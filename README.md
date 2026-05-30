# Avenue Manufacturing Data Platform

Avenue Manufacturing Data Platform (Avenue MDP) is a Dockerized monorepo MVP foundation for configurable manufacturing data services. The current milestone includes FastAPI, React/Vite, PostgreSQL 16, SQLAlchemy, Alembic, Docker Compose, pgAdmin, JWT authentication, user management, data model metadata CRUD, generated Type A storage tables, dynamic inbound/outbound APIs, transaction logging, API key authentication for external systems, and external connection metadata management.

## Architecture Summary

- `backend/`: Python FastAPI service running on port `8000`
- `frontend/`: React + Vite dashboard running on port `3000`
- `postgres`: PostgreSQL 16 database with a named Docker volume
- `pgadmin`: Optional database administration UI on port `5050`

The frontend supports login, a consolidated Admin UI, data model management, Type B mapping, DB browsing, outbound data browsing, API key management, transaction monitoring, connection management, demo data controls, and user viewing.

Authentication is implemented with bcrypt password hashing and JWT bearer tokens. A default admin user is seeded on backend startup when no users exist.

## Local Setup

Prerequisites:

- Docker Desktop
- Docker Compose

Create a local environment file if you want to override defaults:

```bash
cp .env.example .env
```

Start the full stack from the repository root:

```bash
docker compose up -d --build
```

Rebuild after backend or frontend dependency changes:

```bash
docker compose up -d --build
```

Check containers:

```bash
docker compose ps
```

Follow backend logs:

```bash
docker compose logs -f backend
```

Stop the stack:

```bash
docker compose down
```

## URLs

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs
- pgAdmin: http://localhost:5050

## Default Admin Account

- Username: `admin`
- Email: `admin@mdp.local`
- Password: `admin123`
- Role: `admin`

## Admin Web UI

The Avenue MDP Admin Web UI at `http://localhost:3000` is the main MVP demo workspace. It uses an enterprise-style dark sidebar and light data workspace with:

- Dashboard
- Data Models
- DB Browser
- Data Browser
- API Keys
- Transactions
- Connections
- Demo Data
- Users

The dashboard summarizes data models, Type A/Type B split, active API keys, active connections, today's inbound/outbound transactions, failed transactions, and procurement demo seed status. It also includes quick links for creating the demo Type B Supplier and Purchase Order Summary models.

Recommended demo flow:

1. Open `Demo Data` and seed procurement staging data.
2. Open `DB Browser` and inspect `mdp_staging` tables and `vw_jde_purchase_order_summary`.
3. Open `Data Models` and create a Type B `supplier` model from `mdp_staging.stg_jde_supplier`.
4. Create a Type B `purchase_order_summary` model from `mdp_staging.vw_jde_purchase_order_summary`.
5. Open `Data Browser` and query saved models through `/outbound/{model_name}`.
6. Open `API Keys` and create a scoped key for selected models and directions.
7. Test outbound access with the API key.
8. Open `Transactions` to review JWT/API-key activity and failures.

The UI uses selectors for system-backed choices such as model type, schemas, tables/views, columns, data types, API key scope, directions, transaction filters, and connection types so demo users do not need to type internal identifiers manually.

Users page capabilities:

- Create users with username, email, full name, role, password, and active status.
- View and edit user profile fields.
- Activate or deactivate users without deleting the row.
- Reset user passwords from the Admin UI.
- Filter users by search text, role, and status.

Current roles are basic labels: `admin`, `data_engineer`, `api_manager`, and `viewer`. Fine-grained RBAC will be added later.

## Backend

Health check:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "manufacturing-data-platform"
}
```

Alembic is configured under `backend/alembic` for users and data model metadata tables.

## Authentication

Login API example:

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"admin123\"}"
```

The response includes a JWT access token:

```json
{
  "access_token": "<token>",
  "token_type": "bearer"
}
```

Use the token with protected APIs:

```bash
curl http://localhost:8000/auth/me \
  -H "Authorization: Bearer <token>"
```

## Data Model Management

All `/data-models` endpoints require a JWT bearer token.

Create a Type A ingested model:

```bash
curl -X POST http://localhost:8000/data-models \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"invoice\",\"display_name\":\"Invoice\",\"type\":\"A\",\"primary_key\":\"invoice_no\",\"attributes\":[{\"name\":\"invoice_no\",\"display_name\":\"Invoice Number\",\"data_type\":\"text\",\"required\":true,\"is_primary_key\":true}]}"
```

List active Type A models:

```bash
curl "http://localhost:8000/data-models?status=active&type=A" \
  -H "Authorization: Bearer <token>"
```

Update a model:

```bash
curl -X PUT http://localhost:8000/data-models/<id> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d "{\"display_name\":\"Supplier Invoice\"}"
```

Deactivate a model:

```bash
curl -X DELETE http://localhost:8000/data-models/<id> \
  -H "Authorization: Bearer <token>"
```

This milestone stores model metadata and creates generated PostgreSQL storage tables for Type A models.

Type A models now automatically create a PostgreSQL table in the `mdp_data` schema when the model is created. For example, creating the `invoice` Type A model creates:

```text
mdp_data.dm_invoice
```

Type B models store metadata only and do not generate new tables. Updating a model does not alter an already generated table in this milestone, and deactivating a model does not drop the generated table.

### Type B Linked Models

Type B data models link attributes to existing PostgreSQL staging columns instead of creating new tables. For the MVP, these mappings target verified tables such as `mdp_staging.stg_jde_supplier`.

Current Type B rules:

- All attributes must map to one source table per model.
- `source_schema`, `source_table`, and `source_column` are required for each attribute.
- Allowed source schemas are `mdp_staging`, `public`, and `mdp_data`.
- The source table and columns must exist.
- Declared model data types must be compatible with source column types.
- A primary key is required.
- Nullable primary key metadata produces a warning instead of a hard failure. This is especially important for PostgreSQL views, where `information_schema` often cannot reliably enforce nullability.

Validate a draft Type B mapping:

```bash
curl -X POST http://localhost:8000/data-models/type-b/validate-mapping \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"supplier\",\"display_name\":\"Supplier\",\"type\":\"B\",\"primary_key\":\"supplier_code\",\"attributes\":[{\"name\":\"supplier_code\",\"display_name\":\"Supplier Code\",\"data_type\":\"text\",\"required\":true,\"source_schema\":\"mdp_staging\",\"source_table\":\"stg_jde_supplier\",\"source_column\":\"supplier_code\",\"is_primary_key\":true},{\"name\":\"supplier_name\",\"display_name\":\"Supplier Name\",\"data_type\":\"text\",\"required\":true,\"source_schema\":\"mdp_staging\",\"source_table\":\"stg_jde_supplier\",\"source_column\":\"supplier_name\"}]}"
```

Preview an unsaved mapping:

```bash
curl -X POST "http://localhost:8000/data-models/type-b/preview?limit=20" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d @supplier-type-b.json
```

Preview a saved Type B model:

```bash
curl "http://localhost:8000/data-models/<id>/mapped-preview?limit=20" \
  -H "Authorization: Bearer <token>"
```

Type B Mapping UI flow:

1. Open `Data Models`.
2. Choose `Type B: Linked Model`.
3. Select `mdp_staging` and a staging table or view.
4. Click `Generate Attributes from Source Columns`.
5. Pick one primary key attribute.
6. Validate the mapping, preview rows, then save.

To create `supplier`, select `mdp_staging.stg_jde_supplier`, generate attributes, keep the supplier fields you need, and mark `supplier_code` as the primary key.

To create `purchase_order_summary`, select `mdp_staging.vw_jde_purchase_order_summary`, generate attributes, keep the purchase order summary fields, and mark `po_no` as the primary key. View nullability warnings are expected and do not block saving.

In the UI, Type A models are ingested models that create generated PostgreSQL tables. Type B models are linked models that expose existing staging tables or views without creating new tables. Saved Type B models can be queried through `/outbound/{model_name}` and `/outbound/{model_name}/{key}`.

Oracle connector and sync jobs are still deferred.

## Dynamic Inbound API

Type A models accept authenticated flat JSON payloads at:

```text
POST /inbound/{model_name}
```

Example for `quality_result`:

```bash
curl -X POST http://localhost:8000/inbound/quality_result \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d "{\"result_no\":\"QR-001\",\"item_code\":\"ITEM-1001\",\"batch_no\":\"BATCH-2026-001\",\"inspection_date\":\"2026-05-30\",\"result_value\":98.5,\"passed\":true}"
```

Example response:

```json
{
  "status": "success",
  "model": "quality_result",
  "record_id": "00000000-0000-0000-0000-000000000000",
  "message": "Data received successfully"
}
```

Inbound validation uses the active Type A data model attributes:

- Required attributes must be present and non-null.
- Unknown fields are ignored for mapped table columns.
- Unknown fields remain preserved in `raw_payload`.
- Supported data types: `text`, `integer`, `float`, `boolean`, `date`, `datetime`, `json`.

Each inbound request writes a transaction log. Successful logs include request and response payloads. Failed validation or insert attempts write failed logs when the data model is found.

Current limitations:

- JWT or scoped API key authentication is required for inbound APIs.
- Insert only; no upsert behavior yet.
- Type B inbound is not supported.
- MQTT and schema evolution are not implemented yet.

## Dynamic Outbound API

Type A and Type B models can be queried through authenticated outbound APIs:

```text
GET /outbound/{model_name}
GET /outbound/{model_name}/{key}
```

Examples:

```bash
curl http://localhost:8000/outbound/quality_result \
  -H "Authorization: Bearer <token>"

curl http://localhost:8000/outbound/quality_result/QR-001 \
  -H "Authorization: Bearer <token>"

curl http://localhost:8000/outbound/supplier \
  -H "Authorization: Bearer <token>"

curl http://localhost:8000/outbound/supplier/SUP-1001 \
  -H "Authorization: Bearer <token>"

curl "http://localhost:8000/outbound/supplier?country=VN" \
  -H "Authorization: Bearer <token>"

curl http://localhost:8000/outbound/purchase_order_summary \
  -H "Authorization: Bearer <token>"

curl http://localhost:8000/outbound/purchase_order_summary/PO-2026-0001 \
  -H "Authorization: Bearer <token>"

curl "http://localhost:8000/outbound/purchase_order_summary?po_status=open" \
  -H "Authorization: Bearer <token>"
```

List response shape:

```json
{
  "status": "success",
  "model": "quality_result",
  "type": "A",
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

Type B responses use model attribute names and do not expose the source table/view in each data row:

```json
{
  "status": "success",
  "model": "supplier",
  "type": "B",
  "count": 5,
  "limit": 100,
  "offset": 0,
  "data": [
    {
      "supplier_code": "SUP-1001",
      "supplier_name": "ABC Industrial Supplies",
      "country": "VN",
      "status": "active"
    }
  ]
}
```

By-key response shape:

```json
{
  "status": "success",
  "model": "quality_result",
  "type": "A",
  "key": "QR-001",
  "data": {
    "result_no": "QR-001",
    "item_code": "ITEM-1001"
  }
}
```

Options:

- `limit`: default `100`, max `500`
- `offset`: default `0`
- `include_meta=true`: include `id`, `created_at`, `updated_at`
- `include_raw=true`: include `raw_payload` for Type A only
- Equality filters on model attributes, such as `?item_code=ITEM-1001&passed=true` or `?country=VN`

Current limitations:

- Type B outbound supports one mapped source table or view per model.
- Type B `include_raw=true` returns `400` because linked models do not have `raw_payload`.
- JWT or scoped API key authentication is required.
- Equality filters only.
- No AI semantic query layer yet.

## API Key Authentication

Human users authenticate with JWT. External systems can call inbound and outbound APIs with an API key:

```text
X-API-Key: <api_key>
```

API keys are managed by authenticated users. The plain key is shown only once during creation and is never stored by the backend.

Create an API key:

```bash
curl -X POST http://localhost:8000/api-keys \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"QMS integration\",\"source_system\":\"QMS\",\"allowed_directions\":[\"inbound\",\"outbound\"],\"allowed_models\":[\"quality_result\"]}"
```

Example create response includes `api_key` once:

```json
{
  "id": "...",
  "name": "QMS integration",
  "key_prefix": "mdp_live_abcd123",
  "api_key": "mdp_live_abcd123...",
  "source_system": "QMS",
  "allowed_directions": ["inbound", "outbound"],
  "allowed_models": ["quality_result"],
  "is_active": true
}
```

Inbound with API key:

```bash
curl -X POST http://localhost:8000/inbound/quality_result \
  -H "X-API-Key: <api_key>" \
  -H "Content-Type: application/json" \
  -d "{\"result_no\":\"QR-001\",\"result_value\":98.5,\"passed\":true}"
```

Outbound with API key:

```bash
curl http://localhost:8000/outbound/quality_result/QR-001 \
  -H "X-API-Key: <api_key>"
```

API keys can be scoped by direction (`inbound`, `outbound`) and model names. Null or empty `allowed_models` means all models are allowed. Transaction logs record whether the request used JWT or API key authentication.

## Connection Manager

Authenticated users can manage external system connection metadata through:

```text
POST /connections
GET /connections
GET /connections/{id}
PUT /connections/{id}
DELETE /connections/{id}
POST /connections/{id}/test
```

Supported connection types:

- `postgresql`
- `oracle`
- `sqlserver`
- `rest_api`
- `mqtt`

Connection passwords are encrypted with Fernet before storage using `CONNECTION_SECRET_KEY`. API responses never return `password` or `encrypted_password`.

Example PostgreSQL connection:

```bash
curl -X POST http://localhost:8000/connections \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"plant_postgres\",\"type\":\"postgresql\",\"host\":\"postgres\",\"port\":5432,\"database_name\":\"mdp\",\"username\":\"mdp_user\",\"password\":\"mdp_password\"}"
```

Example Oracle JDE connection metadata:

```json
{
  "name": "jde_production",
  "type": "oracle",
  "host": "jde-db.company.local",
  "port": 1521,
  "database_name": "JDEPROD",
  "username": "jde_readonly",
  "password": "<password>",
  "description": "JDE ERP production Oracle database"
}
```

Current limitations:

- Connection records are metadata only until sync jobs and mapping features are added.
- Oracle tests require the Oracle Python driver and client/network configuration.
- SQL Server tests require `pyodbc` and a compatible ODBC driver.
- MQTT testing currently validates metadata only.
- Connection records are not used for migration or sync jobs yet.

## Mock JDE Procurement Staging Data

The MVP includes mock PostgreSQL staging tables in the `mdp_staging` schema. These tables simulate procurement data from Oracle JDE that has already been migrated by an external ETL or database migration tool.

The real Oracle JDE connector and sync jobs are deferred to later milestones.

Simulated JDE tables:

- `F0101` / `F0401`: `mdp_staging.stg_jde_supplier`
- `F4301`: `mdp_staging.stg_jde_po_header`
- `F4311`: `mdp_staging.stg_jde_po_line`
- `F43121`: `mdp_staging.stg_jde_po_receipt`
- `F0411`: `mdp_staging.stg_jde_ap_invoice`

Curated procurement view:

- `mdp_staging.vw_jde_purchase_order_summary`

This view joins and summarizes supplier, purchase order header, purchase order line, and AP invoice staging data into one row per purchase order. It exists so the MVP can create a Type B `purchase_order_summary` model against one source object while the full multi-table Type B join engine remains deferred.

Reseed demo data from the API:

```bash
curl -X POST http://localhost:8000/admin/demo/seed-procurement-staging \
  -H "Authorization: Bearer <token>"
```

Check row counts:

```bash
curl http://localhost:8000/admin/demo/procurement-staging-summary \
  -H "Authorization: Bearer <token>"
```

SQL examples:

```sql
SELECT * FROM mdp_staging.stg_jde_supplier;
SELECT * FROM mdp_staging.stg_jde_po_header;
SELECT * FROM mdp_staging.stg_jde_po_line;
SELECT * FROM mdp_staging.stg_jde_po_receipt;
SELECT * FROM mdp_staging.stg_jde_ap_invoice;
SELECT * FROM mdp_staging.vw_jde_purchase_order_summary;
```

## DB Table Browser

The DB Browser lets authenticated administrators inspect PostgreSQL schemas, tables, columns, and sample rows. Its first purpose is to inspect migrated staging data before creating Type B Linked Data Models.

Example endpoints:

```text
GET /db-browser/schemas
GET /db-browser/schemas/mdp_staging/tables
GET /db-browser/schemas/mdp_staging/tables/stg_jde_supplier/columns
GET /db-browser/schemas/mdp_staging/tables/stg_jde_supplier/preview
```

Preview supports `limit` and `offset`:

```bash
curl "http://localhost:8000/db-browser/schemas/mdp_staging/tables/stg_jde_supplier/preview?limit=50&offset=0" \
  -H "Authorization: Bearer <token>"
```

Security limits:

- JWT authentication is required.
- Only lowercase snake_case schema and table identifiers are accepted.
- System schemas such as `pg_catalog`, `information_schema`, and `pg_toast` are excluded.
- The API does not accept raw SQL.
- Preview queries only run after schema and table existence are verified.
- Preview `limit` is capped at `100`.

## Testing Auth In Swagger UI

1. Open http://localhost:8000/docs.
2. Run `POST /auth/login` with username `admin` and password `admin123`.
3. Copy the `access_token` value from the response.
4. Click `Authorize`.
5. Paste the token value into the bearer authorization field.
6. Run protected endpoints such as `GET /auth/me` or `GET /users`.

## Backend Tests

Run tests from the backend container or a local Python environment with backend dependencies installed:

```bash
pytest
```
