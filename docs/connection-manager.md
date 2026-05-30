# Connection Manager

The Connection Manager stores metadata for external systems that will be used by later sync, migration, data mapping, and Type B linked model milestones.

## Supported Types

- `postgresql`
- `oracle`
- `sqlserver`
- `rest_api`
- `mqtt`

## Credential Storage

Passwords are encrypted with Fernet before they are stored in PostgreSQL. The encryption key is derived from:

```text
CONNECTION_SECRET_KEY
```

API responses never return `password` or `encrypted_password`.

## Required Fields

Database connections (`postgresql`, `oracle`, `sqlserver`) require:

- `host`
- `port`
- `database_name`
- `username`

REST API connections require:

- `base_url`

MQTT connections require:

- `host`
- `port`

## Example PostgreSQL Connection

```json
{
  "name": "plant_postgres",
  "type": "postgresql",
  "host": "postgres",
  "port": 5432,
  "database_name": "mdp",
  "username": "mdp_user",
  "password": "mdp_password",
  "description": "Plant staging PostgreSQL database"
}
```

## Example Oracle JDE Connection

```json
{
  "name": "jde_production",
  "type": "oracle",
  "host": "jde-db.company.local",
  "port": 1521,
  "database_name": "JDEPROD",
  "username": "jde_readonly",
  "password": "<password>",
  "description": "Oracle database used by JDE ERP"
}
```

## Connection Testing

- PostgreSQL tests open a connection and run `SELECT 1`.
- REST API tests send a `GET` request to `base_url` with a timeout.
- Oracle tests return a clear unavailable-driver message if the Oracle driver/client setup is missing.
- SQL Server tests return a clear unavailable-driver message if `pyodbc` or an ODBC driver is missing.
- MQTT tests validate metadata only and do not open a runtime MQTT connection yet.

## Current Limitations

- No sync jobs.
- No external table browsing.
- No migration workflows.
- No Type B outbound query mapping.
- No MQTT runtime connection test.
