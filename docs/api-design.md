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

When `POST /data-models` creates a Type A model, the response includes `generated_table`, such as `mdp_data.dm_invoice`. Type B model responses return `generated_table` as `null`.

## Dynamic Inbound

`POST /inbound/{model_name}`

Requires a valid JWT for an active user.

Behavior:

- Finds the active data model by `model_name`.
- Accepts Type A models only.
- Validates the flat JSON request body against model attributes.
- Inserts mapped fields into `mdp_data.dm_{model_name}`.
- Stores the full original request body in `raw_payload`.
- Writes a transaction log.

Example:

```json
{
  "result_no": "QR-001",
  "item_code": "ITEM-1001",
  "batch_no": "BATCH-2026-001",
  "inspection_date": "2026-05-30",
  "result_value": 98.5,
  "passed": true
}
```

Response:

```json
{
  "status": "success",
  "model": "quality_result",
  "record_id": "...",
  "message": "Data received successfully"
}
```

Current limitations:

- Insert only; no upsert yet.
- JWT is required. API key access for external systems will be added later.
- Type B inbound, outbound APIs, MQTT, and schema evolution are not implemented yet.

## Transactions

Transaction APIs require a valid JWT:

- `GET /transactions`
- `GET /transactions/{id}`

`GET /transactions` supports filters:

- `direction`
- `protocol`
- `status`
- `data_model_id`
- `limit`
- `offset`
