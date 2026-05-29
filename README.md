# Manufacturing Data Platform

Manufacturing Data Platform is a Dockerized monorepo MVP foundation for configurable manufacturing data services. This milestone provides only the clean project base: FastAPI backend, React/Vite frontend, PostgreSQL 16, SQLAlchemy, Alembic, Docker Compose, and pgAdmin.

Authentication, data model CRUD, automatic table creation, dynamic inbound APIs, and dynamic outbound APIs are intentionally not implemented yet.

## Architecture Summary

- `backend/`: Python FastAPI service running on port `8000`
- `frontend/`: React + Vite dashboard running on port `3000`
- `postgres`: PostgreSQL 16 database with a named Docker volume
- `pgadmin`: Optional database administration UI on port `5050`

The frontend calls the backend `GET /health` endpoint and displays the backend service status.

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

Alembic is configured under `backend/alembic`. No domain migrations are included in this foundation milestone.

