# Deployment

This document describes cloud server preparation for Avenue Manufacturing Data Platform. It does not cover managed Kubernetes, managed databases, or production Oracle/JDE sync jobs.

## Architecture

The production Docker Compose stack runs these services on one Linux server:

- `reverse-proxy`: Caddy, the only public service, exposing ports `80` and `443`.
- `frontend`: React/Vite app served internally on port `3000`.
- `backend`: FastAPI app served internally on port `8000`.
- `postgres`: PostgreSQL 16 with a persistent named volume.
- `pgadmin`: optional admin profile, disabled by default.

PostgreSQL, backend, and frontend are not exposed directly to the public host. Public traffic reaches the application through Caddy.

## Server Prerequisites

- Linux server
- Docker
- Docker Compose
- Git
- Domain DNS record pointing to the server
- Firewall allowing inbound `80` and `443`
- SSH access restricted to trusted users or networks

## Environment Setup

Create a production environment file from the template:

```bash
cp .env.production.example .env.production
```

Edit `.env.production` and replace every placeholder:

- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `CONNECTION_SECRET_KEY`
- `CORS_ORIGINS`
- `VITE_API_BASE_URL`
- `PGADMIN_DEFAULT_PASSWORD`

Use long, random values for `JWT_SECRET_KEY` and `CONNECTION_SECRET_KEY`. Production startup fails if these values are missing, too short, or still using demo defaults.

Production example:

```env
APP_ENV=production
CORS_ORIGINS=["https://your-domain.example.com"]
VITE_API_BASE_URL=https://your-domain.example.com/api
```

Do not commit `.env.production`.

## Reverse Proxy

The production stack uses `deploy/Caddyfile`.

Current pattern:

- Frontend: `https://your-domain.example.com`
- API through Caddy: `https://your-domain.example.com/api`
- Swagger docs: `https://your-domain.example.com/docs`
- OpenAPI: `https://your-domain.example.com/openapi.json`

The Caddy `handle_path /api/*` rule strips `/api` before forwarding to the backend. This allows the current FastAPI routes, such as `/auth/login` and `/outbound/{model_name}`, to keep working without a backend route prefix refactor.

Before deployment, replace `your-domain.example.com` in `deploy/Caddyfile` with the real domain.

## Run Production Stack

From the repository root:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Check services:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f backend
```

Run database migrations:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec backend alembic upgrade head
```

Optional pgAdmin profile, bound only to server localhost:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production --profile admin up -d pgadmin
```

## Backup

Create a timestamped PostgreSQL dump under `backups/`:

```bash
./scripts/backup_postgres.sh
```

Example output:

```text
backups/mdp_20260530_153000.dump
```

Backup files are ignored by git.

## Restore

Restore from a dump file:

```bash
./scripts/restore_postgres.sh backups/<file>.dump
```

Restore may overwrite data in the target database. Confirm you are using the correct server and backup file before running it.

## Security Notes

- Do not expose PostgreSQL publicly.
- Do not expose backend or frontend container ports publicly.
- Do not expose pgAdmin publicly.
- Use HTTPS through Caddy.
- Use strong production secrets.
- Rotate the default admin password immediately after first login.
- Restrict SSH access.
- Keep the server and Docker patched.
- Store real secrets outside git.
- Review firewall rules before opening the service to users.

## Post-Deployment Smoke Test

After deployment:

1. Open the UI at the production domain.
2. Log in as the default admin, then change the password.
3. Seed procurement demo data from `Demo Data`.
4. Create or verify the Type B `supplier` model.
5. Create or verify the Type B `purchase_order_summary` model.
6. Query both models from `Data Browser`.
7. Create an outbound API key scoped to those models.
8. Query `/api/outbound/supplier/SUP-1001` with `X-API-Key`.
9. Open `Transactions` and confirm successful and failed requests are logged.

## Local Development

Local development remains unchanged:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend
docker compose down
```

Local defaults are for demos only. They are rejected when `APP_ENV=production`.
