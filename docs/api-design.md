# API Design

This milestone exposes health, authentication, user management, and data model metadata endpoints.

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

## Data Models

All data model endpoints require a valid JWT for an active user.

- `POST /data-models`
- `GET /data-models`
- `GET /data-models/{id}`
- `PUT /data-models/{id}`
- `DELETE /data-models/{id}`

`GET /data-models` supports simple filters:

- `status`
- `type`
- `ai_enabled`

`DELETE /data-models/{id}` is a soft delete that sets `status` to `inactive`.
