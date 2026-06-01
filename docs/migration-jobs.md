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
- `initial_load_strategy`: initial scope, such as `full_table`, `row_limited`, `time_window`, or `external_defined`.
- `max_rows_per_run`: optional row limit for controlled test or phased loads.
- `time_window_column`: source/target business timestamp or sequence column used for a scoped time-window run.
- `time_window_column_type`: `date`, `datetime`, `number`, `jde_julian_date`, `text`, or `unknown`.
- `time_window_start` / `time_window_end`: optional configured window values.
- `incremental_strategy`: future incremental strategy, such as `greater_than_last_watermark`.
- `watermark_column`: column used to record incremental position.
- `watermark_column_type`: data type of the watermark column.
- `last_successful_watermark`: latest successful migrated position.
- `last_successful_run_at` / `last_run_at`: operational run timestamps.
- `lookback_window_days` / `lookback_window_minutes`: overlap window for late-arriving or corrected records.
- `validation_level`: desired integrity level, from `basic` to future advanced reconciliation.
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
  "initial_load_strategy": "external_defined",
  "incremental_strategy": "greater_than_last_watermark",
  "watermark_column": "updated_at",
  "watermark_column_type": "datetime",
  "lookback_window_days": 1,
  "validation_level": "basic",
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
- `run_scope`: human-readable scope, such as `full table` or `watermark > 2026-05-31`.
- `from_watermark` / `to_watermark`: incremental range recorded for the run.
- `source_min_watermark` / `source_max_watermark`: optional values copied from external tool/source logs.
- `target_min_watermark` / `target_max_watermark`: values calculated during target validation when configured.
- `validation_status`: `not_validated`, `pass`, `warning`, or `fail`.
- `log_text`: copied log summary or operator note.
- `error_message`: failure details, if any.

MDP does not query huge Oracle source tables by default to calculate row count. Source counts should come from ora2pg or external migration logs.

When a run is marked `success`, MDP updates the parent job:

- `last_run_at`
- `last_successful_run_at`
- `last_successful_watermark`, when `to_watermark` is provided

When a run is marked `failed`, MDP updates `last_run_at` but does not advance `last_successful_watermark`.

## Migration Scope

Migration Jobs can define operational scope before any actual migration tool is run.

Supported initial-load strategies:

- `full_table`: the external loader migrates the full table.
- `row_limited`: the external loader limits rows for testing or phased rollout.
- `time_window`: the external loader migrates records inside a configured time/sequence window.
- `external_defined`: scope is defined outside MDP, for example in an ora2pg config or operator runbook.

MDP records the intended scope. It does not execute the large load in FastAPI.

## Row Limit

`max_rows_per_run` can be used for controlled testing, phased UAT, or limiting small manual loads.

For large production JDE tables, row limiting should be enforced by ora2pg, SQL extraction logic, or another external bulk-loader configuration. MDP stores the planned limit for visibility and audit.

## Time Window Migration

Time-window metadata supports scoped migrations based on a source column such as:

- JDE date/update fields, for example `UPMJ` or `TRDJ`
- standard timestamps such as `created_at` or `updated_at`
- numeric sequence columns

Relevant fields:

- `time_window_column`
- `time_window_column_type`
- `time_window_start`
- `time_window_end`

These values are metadata only in the MVP. They help operators align ora2pg/external loader runs with MDP run records.

## Watermark

A watermark is the latest successfully migrated position.

Examples:

- latest `updated_at` timestamp
- latest JDE Julian date
- latest numeric sequence
- latest external batch position

Fields:

- `watermark_column`
- `watermark_column_type`
- `last_successful_watermark`
- `last_successful_run_at`
- `last_run_at`

When a successful run includes `to_watermark`, MDP stores it as `last_successful_watermark` on the job.

## Incremental Update

Incremental strategy metadata prepares the platform for future incremental jobs.

Supported values:

- `none`: no incremental behavior planned.
- `greater_than_last_watermark`: future run should load records strictly newer than the last successful watermark.
- `greater_equal_last_watermark_with_overlap`: future run should include overlap to handle late-arriving or corrected records.
- `external_defined`: incremental logic is defined outside MDP.

MDP does not yet generate Oracle incremental SQL or execute ora2pg. It stores the intended strategy and run positions.

## Lookback Window

Lookback windows allow future incremental loads to include overlap:

- `lookback_window_days`
- `lookback_window_minutes`

Example:

```text
last_successful_watermark = 2026-05-31T23:59:59
lookback_window_days = 1
next external run starts from 2026-05-30T23:59:59
```

The overlap helps catch late-posted transactions, corrected records, and source-system timing differences. Deduplication/upsert strategy remains a future implementation topic.

## Target Validation

`POST /migration-runs/{id}/validate-target` validates the PostgreSQL target staging table only.

Checks include:

- target schema exists
- target table exists
- target row count
- configured primary key columns exist
- primary key null count
- duplicate key count
- watermark column exists, when configured
- target min/max watermark, when configured
- sample preview if available

Validation results are stored in `migration_validations` for audit visibility.

Target validation is intended to answer:

- Did the expected staging table land in PostgreSQL?
- How many rows are present?
- Are key columns present?
- Are key columns null?
- Are duplicate keys visible?
- Can administrators preview sample rows before creating Type B models?
- If a watermark column is configured, what min/max watermark values exist in the target?

## Data Integrity Validation Levels

`validation_level` describes the intended reconciliation depth.

Current target-side behavior:

- `none`: no validation expected.
- `basic`: target schema/table, row count, configured key checks, and optional watermark min/max.
- `key_integrity`: same current checks, with stronger emphasis on key null/duplicate results.

Future advanced reconciliation:

- `source_target_count`: compare source and target counts from controlled source queries or external logs.
- `checksum_sample`: compare sampled checksums between source and target.
- `full_reconciliation`: full source-target reconciliation for smaller or carefully partitioned datasets.

## Basic vs Advanced Reconciliation

Basic validation is target-side and safe for the MVP:

- It does not query huge Oracle source tables.
- It validates PostgreSQL staging readiness.
- It supports audit visibility before Type B model creation.

Advanced reconciliation is deferred because source-side full counts and checksums over large JDE tables can be expensive. Future implementations should use partitioned checks, external loader logs, source-side summaries, or worker-managed jobs outside FastAPI request handlers.

## JDE Procurement Migration Templates

JDE Procurement Migration Templates are built-in starting points for creating consistent Migration Job records for common procurement data objects. They do not execute ora2pg. They pre-fill source/target metadata, primary key columns, watermark settings, and validation level so users can register external migration work faster.

Templates are available from:

```text
GET /migration-templates
GET /migration-templates/{template_key}
POST /migration-templates/{template_key}/create-job
```

Available templates:

| Template | Source | Target | Primary Key | Watermark | Validation |
| --- | --- | --- | --- | --- | --- |
| `jde_supplier_master` | `PRODDTA.F0101` with related `F0401` | `mdp_staging.stg_jde_supplier` | `supplier_code` | `UPMJ` (`jde_julian_date`) | `key_integrity` |
| `jde_po_header` | `PRODDTA.F4301` | `mdp_staging.stg_jde_po_header` | `po_no` | `UPMJ` (`jde_julian_date`) | `key_integrity` |
| `jde_po_line` | `PRODDTA.F4311` | `mdp_staging.stg_jde_po_line` | `po_no`, `line_no` | `UPMJ` (`jde_julian_date`) | `key_integrity` |
| `jde_po_receipt` | `PRODDTA.F43121` | `mdp_staging.stg_jde_po_receipt` | `receipt_no` | `UPMJ` (`jde_julian_date`) | `key_integrity` |
| `jde_ap_invoice` | `PRODDTA.F0411` | `mdp_staging.stg_jde_ap_invoice` | `invoice_no` | `UPMJ` (`jde_julian_date`) | `key_integrity` |
| `jde_purchase_order_summary_view` | curated PostgreSQL view | `mdp_staging.vw_jde_purchase_order_summary` | `po_no` | none | `basic` |

The purchase order summary template is not an ora2pg source table migration. It tracks and validates the curated PostgreSQL view that combines migrated staging tables for Type B mapping.

When creating a job from a template, users can override:

- job name
- source connection
- source schema
- target table
- estimated rows
- estimated size
- config metadata

JDE table and column names vary by implementation. These templates are practical defaults for the MVP and must be reviewed with the customer DBA/JDE team before production use.

## APIs

All APIs require JWT authentication.

```text
GET /migration-templates
GET /migration-templates/{template_key}
POST /migration-templates/{template_key}/create-job

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

- Customer-specific JDE migration template hardening
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
