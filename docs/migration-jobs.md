# Migration Jobs

Migration Jobs provide a registry and validation layer for external bulk migration work, especially Oracle JDE to PostgreSQL staging loads.

## Architecture Decision

Large JDE Oracle tables can contain tens of millions of rows and tens of GB per table. Avenue MDP does **not** replace `ora2pg` or other proven external bulk loaders for initial full loads.

Recommended approach:

1. Create a Migration Job in Avenue MDP.
2. Run `ora2pg` or another external bulk loader outside FastAPI.
3. Load data into PostgreSQL staging tables, usually `mdp_staging`.
4. Record a Migration Run with row counts, duration, and logs from the external tool.
5. Validate the target staging table in Avenue MDP.
6. Create Type B Linked Data Models over the staging table or curated view.
7. Expose governed outbound APIs from the saved data models.

FastAPI request handlers should not run 4-5 hour, 30M+ row migration loops.

## Tables

### migration_jobs

Stores migration metadata:

- source system and source connection reference
- source schema/table
- target schema/table
- migration tool, such as `ora2pg`
- load mode, such as `external_bulk`
- estimated row count and table size
- primary key columns
- job config and status

### migration_runs

Stores run history:

- run type and trigger type
- status
- started/finished timestamps
- source/target row counts
- rows loaded
- duration
- log text and error message

### migration_validations

Stores validation checks for a migration run:

- target table exists
- target row count
- primary key columns exist
- primary key null counts
- duplicate key counts

## APIs

All APIs require JWT authentication.

```text
POST /migration-jobs
GET /migration-jobs
GET /migration-jobs/{id}
PUT /migration-jobs/{id}
DELETE /migration-jobs/{id}

POST /migration-jobs/{id}/runs
GET /migration-jobs/{id}/runs
GET /migration-runs/{id}
PUT /migration-runs/{id}

POST /migration-runs/{id}/validate-target
```

## Example Ora2pg Job

```json
{
  "name": "jde_supplier_ora2pg",
  "description": "External ora2pg full load for JDE supplier master",
  "source_system": "JDE Oracle",
  "source_type": "oracle",
  "migration_tool": "ora2pg",
  "source_schema": "PRODDTA",
  "source_table": "F0101",
  "target_schema": "mdp_staging",
  "target_table": "stg_jde_supplier",
  "estimated_rows": 30000000,
  "estimated_size_gb": 30,
  "primary_key_columns": ["supplier_code"],
  "load_mode": "external_bulk",
  "config": {
    "ora2pg_project": "jde_supplier"
  }
}
```

## Target Validation

`POST /migration-runs/{id}/validate-target` validates only the PostgreSQL target. It does not query huge Oracle source tables by default.

Checks include:

- target schema exists
- target table exists
- target row count
- configured primary key columns exist
- null count for configured primary key columns
- duplicate key count for configured primary key columns
- first 10 sample rows

Source row counts should be entered from external tool logs, such as ora2pg output.

## Current Limitations

- MDP does not execute long-running ora2pg jobs inside FastAPI.
- No scheduler.
- No incremental sync.
- No Oracle CDC.
- No worker container yet.
- No Oracle source browser yet.

Future phases may add a worker container that invokes ora2pg safely outside request handlers.
