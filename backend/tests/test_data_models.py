from fastapi.testclient import TestClient


def type_a_payload(name: str = "invoice") -> dict:
    return {
        "name": name,
        "display_name": "Invoice",
        "type": "A",
        "category": "finance",
        "description": "Invoice data received from external systems",
        "business_definition": "A commercial document issued by a supplier for payment",
        "owner_department": "Finance",
        "source_system": "External API",
        "primary_key": "invoice_no",
        "sensitivity_level": "internal",
        "ai_enabled": True,
        "attributes": [
            {
                "name": "invoice_no",
                "display_name": "Invoice Number",
                "data_type": "text",
                "required": True,
                "description": "Unique invoice number",
                "source_path": "$.invoice_no",
                "is_primary_key": True,
                "sensitivity": "internal",
                "synonyms": ["invoice id", "invoice code"],
            },
            {
                "name": "amount",
                "display_name": "Amount",
                "data_type": "float",
                "required": True,
                "description": "Invoice amount",
                "source_path": "$.amount",
                "sensitivity": "confidential",
            },
        ],
    }


def type_b_payload(name: str = "supplier") -> dict:
    return {
        "name": name,
        "display_name": "Supplier",
        "type": "B",
        "category": "procurement",
        "description": "Supplier master data linked from JDE staging table",
        "business_definition": "A business entity that provides goods or services",
        "owner_department": "Procurement",
        "source_system": "JDE ERP",
        "primary_key": "supplier_code",
        "sensitivity_level": "internal",
        "ai_enabled": True,
        "attributes": [
            {
                "name": "supplier_code",
                "display_name": "Supplier Code",
                "data_type": "text",
                "required": True,
                "description": "Supplier code from JDE Address Book",
                "source_table": "stg_jde_f0101",
                "source_column": "an8",
                "is_primary_key": True,
                "sensitivity": "internal",
                "synonyms": ["vendor code", "supplier id"],
            },
            {
                "name": "supplier_name",
                "display_name": "Supplier Name",
                "data_type": "text",
                "required": True,
                "description": "Supplier name from JDE Address Book",
                "source_table": "stg_jde_f0101",
                "source_column": "alph",
                "sensitivity": "internal",
                "synonyms": ["vendor name"],
            },
        ],
    }


def test_create_type_a_data_model(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    response = client.post("/data-models", headers=auth_headers, json=type_a_payload())

    assert response.status_code == 201
    assert response.json()["name"] == "invoice"
    assert response.json()["type"] == "A"


def test_create_type_b_data_model(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    response = client.post("/data-models", headers=auth_headers, json=type_b_payload())

    assert response.status_code == 201
    assert response.json()["name"] == "supplier"
    assert response.json()["type"] == "B"


def test_list_data_models(client: TestClient, auth_headers: dict[str, str]) -> None:
    client.post("/data-models", headers=auth_headers, json=type_a_payload())

    response = client.get("/data-models", headers=auth_headers)

    assert response.status_code == 200
    assert len(response.json()) == 1


def test_get_data_model_by_id(client: TestClient, auth_headers: dict[str, str]) -> None:
    create_response = client.post("/data-models", headers=auth_headers, json=type_a_payload())
    data_model_id = create_response.json()["id"]

    response = client.get(f"/data-models/{data_model_id}", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["id"] == data_model_id


def test_update_data_model(client: TestClient, auth_headers: dict[str, str]) -> None:
    create_response = client.post("/data-models", headers=auth_headers, json=type_a_payload())
    data_model_id = create_response.json()["id"]

    response = client.put(
        f"/data-models/{data_model_id}",
        headers=auth_headers,
        json={"display_name": "Supplier Invoice", "category": "accounts_payable"},
    )

    assert response.status_code == 200
    assert response.json()["display_name"] == "Supplier Invoice"
    assert response.json()["category"] == "accounts_payable"


def test_deactivate_data_model(client: TestClient, auth_headers: dict[str, str]) -> None:
    create_response = client.post("/data-models", headers=auth_headers, json=type_a_payload())
    data_model_id = create_response.json()["id"]

    response = client.delete(f"/data-models/{data_model_id}", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["status"] == "inactive"


def test_invalid_model_name_fails(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    payload = type_a_payload(name="Invoice")

    response = client.post("/data-models", headers=auth_headers, json=payload)

    assert response.status_code == 422


def test_invalid_attribute_name_fails(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    payload = type_a_payload()
    payload["attributes"][0]["name"] = "InvoiceNo"

    response = client.post("/data-models", headers=auth_headers, json=payload)

    assert response.status_code == 422


def test_invalid_data_type_fails(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    payload = type_a_payload()
    payload["attributes"][0]["data_type"] = "money"

    response = client.post("/data-models", headers=auth_headers, json=payload)

    assert response.status_code == 422


def test_invalid_primary_key_fails(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    payload = type_a_payload()
    payload["primary_key"] = "missing_key"
    payload["attributes"][0]["is_primary_key"] = False

    response = client.post("/data-models", headers=auth_headers, json=payload)

    assert response.status_code == 422


def test_unauthenticated_request_fails(client: TestClient) -> None:
    response = client.get("/data-models")

    assert response.status_code == 401
