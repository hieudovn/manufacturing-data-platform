# MVP Architecture

This milestone establishes a clean, Dockerized project foundation for the Manufacturing Data Platform. It is designed to run locally on a personal laptop with Docker Compose before later deployment to a cloud server.

## Services

### Frontend

The frontend is a React application built with Vite. It runs on port `3000` and provides login, a protected dashboard, and data model management screens.

### Backend

The backend is a Python FastAPI service. It runs on port `8000`, exposes OpenAPI documentation at `/docs`, configures local-development CORS, and includes a SQLAlchemy database connection foundation.

The backend also provides JWT authentication and basic user management. Passwords are hashed with bcrypt and stored in the `users` table.

Data model management stores business object metadata in the `data_models` table. Type A models also create generated PostgreSQL storage tables in the `mdp_data` schema. Type B models remain metadata-only in this milestone.

Dynamic inbound REST APIs accept authenticated flat JSON payloads for active Type A models and write transaction logs for both successful and failed processing.

### Database

PostgreSQL 16 is the primary application database. It uses the default MVP database settings:

- Database: `mdp`
- User: `mdp_user`
- Password: `mdp_password`

Data is persisted in the Docker named volume `postgres_data`.

### Migration Layer

Alembic manages the current `users` and `data_models` application tables. Generated Type A storage tables are created by the application service at model creation time.

### pgAdmin

pgAdmin is included as an optional local database administration tool on port `5050`.

## Current Scope

Implemented:

- Docker Compose orchestration
- FastAPI app shell
- Health check endpoint
- JWT authentication
- Basic user management APIs
- Default admin user seeding
- Data model metadata CRUD APIs
- Type A generated PostgreSQL table creation
- Dynamic inbound REST API for Type A models
- Transaction logging and transaction read APIs
- SQLAlchemy database connection setup
- Alembic migration setup
- React/Vite dashboard shell
- Frontend login, protected dashboard, and data model page
- Local documentation

Explicitly deferred:

- Fine-grained role-based authorization
- Generated table schema evolution
- Generated table archival/drop policy
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
