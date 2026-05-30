from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from tests.test_data_models import type_a_payload, type_b_payload
from tests.test_inbound import create_sqlite_generated_table


def create_invoice_model_and_records(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
) -> dict:
    model_response = client.post("/data-models", headers=auth_headers, json=type_a_payload())
    assert model_response.status_code == 201
    create_sqlite_generated_table(db_session)
    first = client.post(
        "/inbound/invoice",
        headers=auth_headers,
        json={"invoice_no": "INV-001", "amount": 98.5, "remark": "raw only"},
    )
    second = client.post(
        "/inbound/invoice",
        headers=auth_headers,
        json={"invoice_no": "INV-002", "amount": 125.25},
    )
    assert first.status_code == 200
    assert second.status_code == 200
    return model_response.json()


def test_outbound_list_returns_records(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
) -> None:
    create_invoice_model_and_records(client, auth_headers, db_session)

    response = client.get("/outbound/invoice", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["count"] == 2
    assert set(response.json()["data"][0]) == {"invoice_no", "amount"}


def test_outbound_by_key_returns_one_record(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
) -> None:
    create_invoice_model_and_records(client, auth_headers, db_session)

    response = client.get("/outbound/invoice/INV-001", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["key"] == "INV-001"
    assert response.json()["data"]["invoice_no"] == "INV-001"


def test_include_meta_includes_system_columns(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
) -> None:
    create_invoice_model_and_records(client, auth_headers, db_session)

    response = client.get("/outbound/invoice?include_meta=true", headers=auth_headers)
    record = response.json()["data"][0]

    assert response.status_code == 200
    assert "id" in record
    assert "created_at" in record
    assert "updated_at" in record


def test_include_raw_includes_raw_payload(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
) -> None:
    create_invoice_model_and_records(client, auth_headers, db_session)

    response = client.get("/outbound/invoice?include_raw=true", headers=auth_headers)
    record = response.json()["data"][0]

    assert response.status_code == 200
    assert "raw_payload" in record


def test_equality_filter_works(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
) -> None:
    create_invoice_model_and_records(client, auth_headers, db_session)

    response = client.get("/outbound/invoice?invoice_no=INV-001", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["count"] == 1
    assert response.json()["data"][0]["invoice_no"] == "INV-001"


def test_invalid_filter_field_returns_422(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
) -> None:
    create_invoice_model_and_records(client, auth_headers, db_session)

    response = client.get("/outbound/invoice?raw_payload=x", headers=auth_headers)

    assert response.status_code == 422


def test_model_not_found_returns_404(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    response = client.get("/outbound/missing_model", headers=auth_headers)

    assert response.status_code == 404


def test_type_b_model_returns_400(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    client.post("/admin/demo/seed-procurement-staging", headers=auth_headers)
    create_response = client.post("/data-models", headers=auth_headers, json=type_b_payload())
    assert create_response.status_code == 201

    response = client.get("/outbound/supplier", headers=auth_headers)

    assert response.status_code == 400
    assert response.json()["detail"] == "Outbound API for Type B data models is not supported yet"


def test_no_primary_key_returns_400_for_key_endpoint(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
) -> None:
    payload = type_a_payload()
    payload.pop("primary_key")
    for attribute in payload["attributes"]:
        attribute["is_primary_key"] = False
    create_response = client.post("/data-models", headers=auth_headers, json=payload)
    assert create_response.status_code == 201
    create_sqlite_generated_table(db_session)

    response = client.get("/outbound/invoice/INV-001", headers=auth_headers)

    assert response.status_code == 400
    assert response.json()["detail"] == "No primary_key configured for this data model"


def test_record_not_found_returns_404(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
) -> None:
    create_invoice_model_and_records(client, auth_headers, db_session)

    response = client.get("/outbound/invoice/INV-999", headers=auth_headers)

    assert response.status_code == 404


def test_unauthenticated_outbound_request_fails(client: TestClient) -> None:
    response = client.get("/outbound/invoice")

    assert response.status_code == 401


def test_successful_outbound_query_writes_transaction_log(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
) -> None:
    create_invoice_model_and_records(client, auth_headers, db_session)

    client.get("/outbound/invoice", headers=auth_headers)
    response = client.get(
        "/transactions?direction=outbound&status=success",
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()[0]["status"] == "success"
    assert response.json()[0]["response_payload"]["count"] == 2


def test_failed_outbound_query_writes_transaction_log(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
) -> None:
    create_invoice_model_and_records(client, auth_headers, db_session)

    client.get("/outbound/invoice?not_a_field=x", headers=auth_headers)
    response = client.get(
        "/transactions?direction=outbound&status=failed",
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()[0]["status"] == "failed"
    assert "not_a_field" in response.json()[0]["error_message"]


def test_outbound_does_not_return_raw_table_columns_by_default(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
) -> None:
    create_invoice_model_and_records(client, auth_headers, db_session)

    response = client.get("/outbound/invoice", headers=auth_headers)
    record = response.json()["data"][0]

    assert "raw_payload" not in record
    assert "id" not in record
    assert "created_at" not in record
    assert "updated_at" not in record
