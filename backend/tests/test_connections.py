from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.connection import Connection


def postgresql_payload(name: str = "plant_postgres") -> dict:
    return {
        "name": name,
        "type": "postgresql",
        "description": "Plant PostgreSQL staging database",
        "host": "postgres",
        "port": 5432,
        "database_name": "mdp",
        "username": "mdp_user",
        "password": "mdp_password",
        "config": {"sslmode": "prefer"},
    }


def create_connection(client: TestClient, auth_headers: dict[str, str], payload: dict | None = None) -> dict:
    response = client.post("/connections", headers=auth_headers, json=payload or postgresql_payload())
    assert response.status_code == 201
    return response.json()


def test_create_connection(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
) -> None:
    created = create_connection(client, auth_headers)
    stored = db_session.get(Connection, UUID(created["id"]))

    assert created["name"] == "plant_postgres"
    assert created["type"] == "postgresql"
    assert "password" not in created
    assert "encrypted_password" not in created
    assert stored is not None
    assert stored.encrypted_password != "mdp_password"


def test_list_connections(client: TestClient, auth_headers: dict[str, str]) -> None:
    create_connection(client, auth_headers)

    response = client.get("/connections", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()[0]["name"] == "plant_postgres"
    assert "password" not in response.json()[0]
    assert "encrypted_password" not in response.json()[0]


def test_get_connection(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = create_connection(client, auth_headers)

    response = client.get(f"/connections/{created['id']}", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


def test_update_connection(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = create_connection(client, auth_headers)

    response = client.put(
        f"/connections/{created['id']}",
        headers=auth_headers,
        json={"description": "Updated connection", "password": "new_password"},
    )

    assert response.status_code == 200
    assert response.json()["description"] == "Updated connection"
    assert "password" not in response.json()
    assert "encrypted_password" not in response.json()


def test_deactivate_connection(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = create_connection(client, auth_headers)

    response = client.delete(f"/connections/{created['id']}", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["status"] == "inactive"


def test_invalid_connection_type_fails(client: TestClient, auth_headers: dict[str, str]) -> None:
    payload = postgresql_payload()
    payload["type"] = "ftp"

    response = client.post("/connections", headers=auth_headers, json=payload)

    assert response.status_code == 422


def test_rest_api_requires_base_url(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.post(
        "/connections",
        headers=auth_headers,
        json={"name": "missing_rest_url", "type": "rest_api"},
    )

    assert response.status_code == 422


def test_postgresql_connection_success_if_local_postgres_available(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    url = make_url(settings.database_url)
    payload = {
        "name": "runtime_postgres",
        "type": "postgresql",
        "host": url.host or "postgres",
        "port": url.port or 5432,
        "database_name": url.database or "mdp",
        "username": url.username or "mdp_user",
        "password": url.password or "mdp_password",
    }
    created = create_connection(client, auth_headers, payload)

    response = client.post(f"/connections/{created['id']}/test", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["status"] == "success"


def test_invalid_connection_test_fails_gracefully(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    payload = postgresql_payload("bad_postgres")
    payload["host"] = "invalid-host-name"
    created = create_connection(client, auth_headers, payload)

    response = client.post(f"/connections/{created['id']}/test", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["status"] == "failed"
    assert "PostgreSQL connection failed" in response.json()["message"]


def test_unauthenticated_request_fails(client: TestClient) -> None:
    response = client.get("/connections")

    assert response.status_code == 401
