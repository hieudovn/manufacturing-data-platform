# Migration Jobs

## Purpose

Migration Jobs provide Avenue MDP with a registry and validation layer for external bulk migrations, especially Oracle JDE to PostgreSQL staging loads.

They are not a replacement for ora2pg. They record what should be migrated, what tool was used, how each run completed, and whether the PostgreSQL staging target is ready to support Type B Linked Data Models.

## Why MDP Does Not Replace Ora2pg

Real JDE Oracle tables can contain tens of millions of rows and tens of GB per table. A single table may have 30M+ rows and 30GB+ of data.

ora2pg is optimized for Oracle-to-PostgreSQL bulk migration and can complete large initial loads far faster than a web API performing row-by-row Python or SQLAlchemy inserts.

FastAPI request handlers should not run 4-5 hour migration jobs. Long migrations inside the API container would create timeout, restart, memory, monitoring, and operational risk.

Native Python row-by-row migration is not appropriate for 30GB initial full loads. If native migration exists later, it should be limited to small-table/manual tests only.

## Architecture

Recommended full-load flow:

```text
Oracle JDE
  -> ora2pg / external bulk loader
  -> PostgreSQL mdp_staging
  -> Migration Job / Run Tracking
  -> Target Validation
  -> Type B Data Model
  -> Outbound API
  -> Apps / BI / AI
```

Responsibilities:

- ora2pg or an external loader moves large data volumes.
- PostgreSQL `mdp_staging` stores migrated tables/views.
- Migration Jobs store metadata and intended source/target mapping.
- Migration Runs store execution results copied from external tool logs.
- Target Validation checks the PostgreSQL staging table after the load.
- Type B models expose validated staging data as governed business objects.
- Outbound APIs provide controlled access to apps, BI tools, integrations, and future AI agents.

## Migration Job

`migration_jobs` stores migration metadata.

Important fields:

- `name`: unique job name.
- `source_system`: source system label, commonly `JDE Oracle`.
- `source_connection_id`: optional reference to a Connection Manager record.
- `source_type`: source platform such as `oracle`, `postgresql`, `sqlserver`, or `external`.
- `migration_tool`: tool such as `ora2pg`, `manual`, `external_tool`, or `native_small_table`.
- `source_schema`: source schema, for example `PRODDTA`.
- `source_table`: source table, for example `F0101`.
- `target_schema`: PostgreSQL target schema, usually `mdp_staging`.
- `target_table`: PostgreSQL target table, for example `stg_jde_supplier`.
- `estimated_rows`: expected or approximate source rows.
- `estimated_size_gb`: expected or approximate source size in GB.
- `primary_key_columns`: target primary/business key columns used for validation.
- `load_mode`: `full_load`, `incremental`, `external_bulk`, or `validation_only`.
- `status`: `active` or `inactive`.
- `config`: optional JSON metadata, such as ora2pg project name, config file path, notes, or operator instructions.

Example:

```json
{
  "name": "migrate_jde_supplier_demo",
  "description": "External ora2pg load for JDE supplier master",
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
  "status": "active",
  "config": {
    "ora2pg_project": "jde_supplier"
  }
}
```

## Migration Run

`migration_runs` stores execution history. A run can represent an ora2pg full load, manual validation, or another external bulk-loader run.

Important fields:

- `run_type`: `full_load`, `incremental`, `validation_only`, or `external_bulk`.
- `trigger_type`: `manual`, `external`, or `scheduled`.
- `status`: `pending`, `running`, `success`, `failed`, or `cancelled`.
- `source_row_count`: source row count copied from ora2pg or external logs.
- `target_row_count`: target row count after load or validation.
- `rows_loaded`: rows loaded according to the external tool.
- `duration_seconds`: elapsed runtime.
- `log_text`: copied log summary or operator note.
- `error_message`: failure details, if any.

MDP does not query huge Oracle source tables by default to calculate row count. Source counts should come from ora2pg or external migration logs.

## Target Validation

`POST /migration-runs/{id}/validate-target` validates the PostgreSQL target staging table only.

Checks include:

- target schema exists
- target table exists
- target row count
- configured primary key columns exist
- primary key null count
- duplicate key count
- sample preview if available

Validation results are stored in `migration_validations` for audit visibility.

Target validation is intended to answer:

- Did the expected staging table land in PostgreSQL?
- How many rows are present?
- Are key columns present?
- Are key columns null?
- Are duplicate keys visible?
- Can administrators preview sample rows before creating Type B models?

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

`DELETE /migration-jobs/{id}` is a soft deactivate. Existing run history and validation results are preserved.

## Demo / UAT Flow

Example demo flow using the mock procurement staging data:

1. Seed demo procurement staging data from `Demo Data`.
2. Create a Migration Job:
   - name: `migrate_jde_supplier_demo`
   - source: `PRODDTA.F0101`
   - target: `mdp_staging.stg_jde_supplier`
   - tool: `ora2pg`
3. Create an `external_bulk` run record.
4. Validate the target table.
5. Create or use the Type B `supplier` model.
6. Query:

```text
GET /outbound/supplier/SUP-1001
```

7. Check `Transactions` for outbound API audit visibility.

For real UAT:

1. Run ora2pg externally against a JDE Oracle source.
2. Load real JDE staging tables into PostgreSQL `mdp_staging`.
3. Register the migration job and run in MDP.
4. Validate target staging row counts and keys.
5. Create Type B models from real staging tables/views.
6. Query governed outbound APIs instead of raw source tables.

## Future Phases

- JDE migration templates
- Worker container to invoke ora2pg safely outside FastAPI request handlers
- Scheduler
- Incremental sync
- Source row count integration
- Oracle source browser
- WSO2 integration adapter
- Operational alerts for failed runs
- Data quality checks beyond key/null/duplicate validation

## Current Limitations

- MDP does not execute long-running ora2pg jobs inside FastAPI.
- No scheduler yet.
- No incremental sync yet.
- No Oracle CDC yet.
- No worker container yet.
- No Oracle source browser yet.
