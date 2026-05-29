# API Design

This milestone exposes health, authentication, and basic user management endpoints.

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
