# Mock JDE Procurement Staging

The `mdp_staging` schema simulates JDE procurement data already migrated into PostgreSQL by an external ETL or database migration tool.

This milestone does not implement an Oracle connector, sync jobs, table browsing, Type B outbound APIs, or Type B data mapping.

## Procurement Flow

```text
Supplier -> Purchase Order Header -> Purchase Order Line -> PO Receipt -> AP Invoice
```

## Simulated JDE Tables

| JDE source | Staging table | Purpose |
| --- | --- | --- |
| `F0101` / `F0401` | `mdp_staging.stg_jde_supplier` | Address Book and Supplier Master |
| `F4301` | `mdp_staging.stg_jde_po_header` | Purchase Order Header |
| `F4311` | `mdp_staging.stg_jde_po_line` | Purchase Order Detail |
| `F43121` | `mdp_staging.stg_jde_po_receipt` | Purchase Order Receiver / Goods Receipt |
| `F0411` | `mdp_staging.stg_jde_ap_invoice` | Accounts Payable Ledger / Supplier Invoice |

## Seeded Row Counts

| Table | Rows |
| --- | ---: |
| `stg_jde_supplier` | 5 |
| `stg_jde_po_header` | 5 |
| `stg_jde_po_line` | 5 |
| `stg_jde_po_receipt` | 3 |
| `stg_jde_ap_invoice` | 5 |

## Admin Endpoints

```text
POST /admin/demo/seed-procurement-staging
GET /admin/demo/procurement-staging-summary
```

Both endpoints require JWT authentication.

## SQL Checks

```sql
SELECT * FROM mdp_staging.stg_jde_supplier;
SELECT * FROM mdp_staging.stg_jde_po_header;
SELECT * FROM mdp_staging.stg_jde_po_line;
SELECT * FROM mdp_staging.stg_jde_po_receipt;
SELECT * FROM mdp_staging.stg_jde_ap_invoice;
```

## DB Browser Checks

The same staging tables can be inspected through the JWT-protected DB Browser:

```text
GET /db-browser/schemas
GET /db-browser/schemas/mdp_staging/tables
GET /db-browser/schemas/mdp_staging/tables/stg_jde_supplier/columns
GET /db-browser/schemas/mdp_staging/tables/stg_jde_supplier/preview
```

## Current Limitations

- No Oracle JDE connector.
- No sync job scheduler.
- No Type B model mapping.
- No Type B outbound API.
- No staging table browsing UI.
