# Manufacturing Data Platform

Manufacturing Data Platform is a Dockerized monorepo MVP foundation for configurable manufacturing data services. The current milestone includes FastAPI, React/Vite, PostgreSQL 16, SQLAlchemy, Alembic, Docker Compose, pgAdmin, JWT authentication, user management, and data model metadata CRUD.

Automatic table creation, dynamic inbound APIs, and dynamic outbound APIs are intentionally not implemented yet.

## Architecture Summary

- `backend/`: Python FastAPI service running on port `8000`
- `frontend/`: React + Vite dashboard running on port `3000`
- `postgres`: PostgreSQL 16 database with a named Docker volume
- `pgadmin`: Optional database administration UI on port `5050`

The frontend supports login, a protected dashboard, and a basic data model management page.

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

This milestone stores model metadata and creates generated PostgreSQL storage tables for Type A models. It does not expose dynamic inbound or outbound APIs yet.

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

- JWT is required for inbound APIs. API keys for external systems will be added later.
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
- JWT is required. API key access for external systems will be added later.
- Equality filters only.
- No AI semantic query layer yet.

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
