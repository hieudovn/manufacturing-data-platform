# Deployment

The first deployment target is local Docker Compose from the repository root.

## Local Docker Compose

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend
docker compose down
```

## Service URLs

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs
- pgAdmin: http://localhost:5050

Cloud deployment details are deferred until after the local MVP foundation is validated.

## Required Secrets

Set these values in `.env` or the target deployment environment:

- `JWT_SECRET_KEY`: signs user JWT access tokens.
- `CONNECTION_SECRET_KEY`: encrypts external connection passwords.

Use deployment-specific values for cloud environments. Do not reuse the example `change_me` defaults outside local development.
