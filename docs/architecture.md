# MVP Architecture

This milestone establishes a clean, Dockerized project foundation for the Manufacturing Data Platform. It is designed to run locally on a personal laptop with Docker Compose before later deployment to a cloud server.

## Services

### Frontend

The frontend is a React application built with Vite. It runs on port `3000` and provides a minimal dashboard that checks backend availability through `GET /health`.

### Backend

The backend is a Python FastAPI service. It runs on port `8000`, exposes OpenAPI documentation at `/docs`, configures local-development CORS, and includes a SQLAlchemy database connection foundation.

### Database

PostgreSQL 16 is the primary application database. It uses the default MVP database settings:

- Database: `mdp`
- User: `mdp_user`
- Password: `mdp_password`

Data is persisted in the Docker named volume `postgres_data`.

### Migration Layer

Alembic is configured for future schema migrations. This foundation does not yet create application tables because data model management and automatic table creation are later milestones.

### pgAdmin

pgAdmin is included as an optional local database administration tool on port `5050`.

## Current Scope

Implemented:

- Docker Compose orchestration
- FastAPI app shell
- Health check endpoint
- SQLAlchemy database connection setup
- Alembic migration setup
- React/Vite dashboard shell
- Frontend-to-backend health check
- Local documentation

Explicitly deferred:

- Authentication and authorization
- Data model CRUD
- Automatic PostgreSQL table creation
- Dynamic inbound REST APIs
- Dynamic outbound REST APIs
- ERP and SQL Server integration
- Time-series databases, TimescaleDB, IIoT, sensor data, and realtime telemetry

## Runtime Flow

1. Docker Compose starts PostgreSQL.
2. The backend waits for PostgreSQL health before starting.
3. The frontend starts after the backend service is created.
4. Browser users open `http://localhost:3000`.
5. The dashboard calls `http://localhost:8000/health`.
6. FastAPI returns the backend service status.

