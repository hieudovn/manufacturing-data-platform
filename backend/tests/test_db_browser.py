from fastapi.testclient import TestClient

from app.services.procurement_staging_service import EXPECTED_TABLE_COUNTS


def seed_staging(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.post("/admin/demo/seed-procurement-staging", headers=auth_headers)
    assert response.status_code == 200


def test_schemas_requires_authentication(client: TestClient) -> None:
    response = client.get("/db-browser/schemas")

    assert response.status_code == 401


def test_schemas_returns_mdp_staging(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    seed_staging(client, auth_headers)

    response = client.get("/db-browser/schemas", headers=auth_headers)

    assert response.status_code == 200
    assert "mdp_staging" in response.json()["schemas"]


def test_tables_endpoint_returns_staging_tables(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    seed_staging(client, auth_headers)

    response = client.get(
        "/db-browser/schemas/mdp_staging/tables",
        headers=auth_headers,
    )

    assert response.status_code == 200
    table_names = {table["table_name"] for table in response.json()["tables"]}
    assert set(EXPECTED_TABLE_COUNTS).issubset(table_names)


def test_columns_endpoint_returns_supplier_code(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    seed_staging(client, auth_headers)

    response = client.get(
        "/db-browser/schemas/mdp_staging/tables/stg_jde_supplier/columns",
        headers=auth_headers,
    )

    assert response.status_code == 200
    columns = response.json()["columns"]
    supplier_code = next(column for column in columns if column["column_name"] == "supplier_code")
    assert supplier_code["ordinal_position"] == 1


def test_preview_endpoint_returns_seeded_supplier_rows(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    seed_staging(client, auth_headers)

    response = client.get(
        "/db-browser/schemas/mdp_staging/tables/stg_jde_supplier/preview",
        headers=auth_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 5
    assert "supplier_code" in body["columns"]
    assert any(row["supplier_code"] == "SUP-1001" for row in body["rows"])


def test_invalid_schema_name_returns_422(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    response = client.get(
        "/db-browser/schemas/mdp_staging;/tables",
        headers=auth_headers,
    )

    assert response.status_code == 422


def test_invalid_table_name_returns_422(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    response = client.get(
        "/db-browser/schemas/mdp_staging/tables/stg_jde_supplier;/columns",
        headers=auth_headers,
    )

    assert response.status_code == 422


def test_system_schemas_are_excluded(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    response = client.get("/db-browser/schemas", headers=auth_headers)

    assert response.status_code == 200
    schemas = response.json()["schemas"]
    assert "pg_catalog" not in schemas
    assert "information_schema" not in schemas
    assert "pg_toast" not in schemas


def test_preview_limit_max_is_enforced(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    seed_staging(client, auth_headers)

    response = client.get(
        "/db-browser/schemas/mdp_staging/tables/stg_jde_supplier/preview?limit=500",
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["limit"] == 100


def test_preview_requires_authentication(client: TestClient) -> None:
    response = client.get(
        "/db-browser/schemas/mdp_staging/tables/stg_jde_supplier/preview",
    )

    assert response.status_code == 401
