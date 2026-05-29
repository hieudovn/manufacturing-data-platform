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

This milestone stores model metadata only. It does not create physical PostgreSQL model tables and does not expose dynamic inbound or outbound APIs yet.

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
