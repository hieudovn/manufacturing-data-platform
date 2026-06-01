from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services.procurement_staging_service import seed_procurement_staging_data


def migration_job_payload(name: str = "jde_supplier_ora2pg") -> dict:
    return {
        "name": name,
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
        "config": {"ora2pg_project": "jde_supplier"},
    }


def create_job(client: TestClient, auth_headers: dict[str, str], name: str = "jde_supplier_ora2pg") -> dict:
    response = client.post("/migration-jobs", headers=auth_headers, json=migration_job_payload(name))
    assert response.status_code == 201, response.text
    return response.json()


def test_create_migration_job(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = create_job(client, auth_headers)

    assert created["name"] == "jde_supplier_ora2pg"
    assert created["migration_tool"] == "ora2pg"
    assert created["load_mode"] == "external_bulk"
    assert created["target_schema"] == "mdp_staging"


def test_create_and_update_migration_run(client: TestClient, auth_headers: dict[str, str]) -> None:
    job = create_job(client, auth_headers, "jde_supplier_run_test")

    response = client.post(
        f"/migration-jobs/{job['id']}/runs",
        headers=auth_headers,
        json={
            "run_type": "external_bulk",
            "trigger_type": "external",
            "status": "running",
            "source_row_count": 5,
            "log_text": "ora2pg started outside MDP",
        },
    )
    assert response.status_code == 201, response.text
    run = response.json()

    update_response = client.put(
        f"/migration-runs/{run['id']}",
        headers=auth_headers,
        json={
            "status": "success",
            "target_row_count": 5,
            "rows_loaded": 5,
            "duration_seconds": 10,
            "log_text": "ora2pg finished outside MDP",
        },
    )

    assert update_response.status_code == 200, update_response.text
    assert update_response.json()["status"] == "success"
    assert update_response.json()["rows_loaded"] == 5


def test_validate_target_table_counts_seeded_rows(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
) -> None:
    seed_procurement_staging_data(db_session)
    db_session.commit()
    job = create_job(client, auth_headers, "jde_supplier_validate")
    run_response = client.post(
        f"/migration-jobs/{job['id']}/runs",
        headers=auth_headers,
        json={"run_type": "external_bulk", "trigger_type": "external", "status": "success"},
    )
    run = run_response.json()

    response = client.post(f"/migration-runs/{run['id']}/validate-target", headers=auth_headers)

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "success"
    assert data["target_row_count"] == 5
    assert len(data["sample_rows"]) > 0
    checks = {validation["check_name"]: validation for validation in data["validations"]}
    assert checks["target_table_exists"]["status"] == "pass"
    assert checks["primary_key_null_count:supplier_code"]["target_value"] == "0"
    assert checks["primary_key_duplicate_count"]["target_value"] == "0"


def test_validate_target_table_missing_table_fails(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    payload = migration_job_payload("missing_target_job")
    payload["target_table"] = "stg_missing_table"
    job_response = client.post("/migration-jobs", headers=auth_headers, json=payload)
    assert job_response.status_code == 201
    job = job_response.json()
    run_response = client.post(
        f"/migration-jobs/{job['id']}/runs",
        headers=auth_headers,
        json={"run_type": "external_bulk", "trigger_type": "external", "status": "success"},
    )
    run = run_response.json()

    response = client.post(f"/migration-runs/{run['id']}/validate-target", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "failed"
    assert any(v["check_name"] == "target_table_exists" and v["status"] == "fail" for v in data["validations"])


def test_list_migration_runs(client: TestClient, auth_headers: dict[str, str]) -> None:
    job = create_job(client, auth_headers, "jde_supplier_list_runs")
    client.post(
        f"/migration-jobs/{job['id']}/runs",
        headers=auth_headers,
        json={"run_type": "external_bulk", "trigger_type": "external", "status": "pending"},
    )

    response = client.get(f"/migration-jobs/{job['id']}/runs", headers=auth_headers)

    assert response.status_code == 200
    assert len(response.json()) == 1


def test_migration_job_requires_auth(client: TestClient) -> None:
    assert client.get("/migration-jobs").status_code == 401
    assert client.post("/migration-jobs", json=migration_job_payload()).status_code == 401
