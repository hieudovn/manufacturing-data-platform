# Manufacturing Data Platform

Manufacturing Data Platform is a Dockerized monorepo MVP foundation for configurable manufacturing data services. The current milestone includes FastAPI, React/Vite, PostgreSQL 16, SQLAlchemy, Alembic, Docker Compose, pgAdmin, JWT authentication, user management, data model metadata CRUD, generated Type A storage tables, dynamic inbound/outbound APIs, transaction logging, API key authentication for external systems, and external connection metadata management.

## Architecture Summary

- `backend/`: Python FastAPI service running on port `8000`
- `frontend/`: React + Vite dashboard running on port `3000`
- `postgres`: PostgreSQL 16 database with a named Docker volume
- `pgadmin`: Optional database administration UI on port `5050`

The frontend supports login, a protected dashboard, data model management, transaction viewing, data browsing, API key management, and connection management.

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

Type A models can be queried through authenticated outbound APIs:

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
```

List response shape:

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

By-key response shape:

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

Options:

- `limit`: default `100`, max `500`
- `offset`: default `0`
- `include_meta=true`: include `id`, `created_at`, `updated_at`
- `include_raw=true`: include `raw_payload`
- Equality filters on model attributes, such as `?item_code=ITEM-1001&passed=true`

Current limitations:

- Type A only. Type B outbound mapping will be added later.
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
- No table browsing, migration, sync jobs, or Type B query mapping are implemented yet.

## Mock JDE Procurement Staging Data

The MVP includes mock PostgreSQL staging tables in the `mdp_staging` schema. These tables simulate procurement data from Oracle JDE that has already been migrated by an external ETL or database migration tool.

The real Oracle JDE connector, sync jobs, table browsing, and Type B outbound mapping are deferred to later milestones.

Simulated JDE tables:

- `F0101` / `F0401`: `mdp_staging.stg_jde_supplier`
- `F4301`: `mdp_staging.stg_jde_po_header`
- `F4311`: `mdp_staging.stg_jde_po_line`
- `F43121`: `mdp_staging.stg_jde_po_receipt`
- `F0411`: `mdp_staging.stg_jde_ap_invoice`

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
