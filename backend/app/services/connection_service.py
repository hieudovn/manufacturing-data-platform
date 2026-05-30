import base64
import hashlib
import uuid
from datetime import UTC, datetime
from typing import Any

import httpx
from cryptography.fernet import Fernet
from pydantic import ValidationError
from sqlalchemy import URL, create_engine, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.connection import Connection
from app.schemas.connection import ConnectionCreate, ConnectionUpdate


class ConnectionTestError(Exception):
    pass


def _fernet() -> Fernet:
    key = base64.urlsafe_b64encode(
        hashlib.sha256(settings.connection_secret_key.encode("utf-8")).digest()
    )
    return Fernet(key)


def encrypt_password(password: str | None) -> str | None:
    if not password:
        return None
    return _fernet().encrypt(password.encode("utf-8")).decode("utf-8")


def decrypt_password(encrypted_password: str | None) -> str | None:
    if not encrypted_password:
        return None
    return _fernet().decrypt(encrypted_password.encode("utf-8")).decode("utf-8")


def get_connection(db: Session, connection_id: uuid.UUID) -> Connection | None:
    return db.get(Connection, connection_id)


def get_connection_by_name(db: Session, name: str) -> Connection | None:
    return db.scalar(select(Connection).where(Connection.name == name))


def list_connections(
    db: Session,
    *,
    connection_type: str | None = None,
    status: str | None = None,
) -> list[Connection]:
    query = select(Connection).order_by(Connection.created_at.desc())
    if connection_type is not None:
        query = query.where(Connection.type == connection_type)
    if status is not None:
        query = query.where(Connection.status == status)
    return list(db.scalars(query))


def _stringify_base_url(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("base_url") is not None:
        payload["base_url"] = str(payload["base_url"])
    return payload


def create_connection(
    db: Session,
    connection_in: ConnectionCreate,
    created_by: uuid.UUID | None,
) -> Connection:
    payload = _stringify_base_url(connection_in.model_dump(exclude={"password"}))
    connection = Connection(
        **payload,
        encrypted_password=encrypt_password(connection_in.password),
        created_by=created_by,
    )
    db.add(connection)
    db.commit()
    db.refresh(connection)
    return connection


def _payload_from_model(connection: Connection) -> dict[str, Any]:
    return {
        "name": connection.name,
        "type": connection.type,
        "description": connection.description,
        "host": connection.host,
        "port": connection.port,
        "database_name": connection.database_name,
        "username": connection.username,
        "base_url": connection.base_url,
        "mqtt_topic_prefix": connection.mqtt_topic_prefix,
        "config": connection.config,
        "status": connection.status,
    }


def validate_updated_connection(
    connection: Connection,
    connection_in: ConnectionUpdate,
) -> dict[str, Any]:
    payload = _payload_from_model(connection)
    update_data = connection_in.model_dump(exclude_unset=True, exclude={"password"})
    payload.update(update_data)
    try:
        validated = ConnectionCreate.model_validate(payload)
    except ValidationError:
        raise
    return _stringify_base_url(validated.model_dump(exclude={"password"}))


def update_connection(
    db: Session,
    connection: Connection,
    connection_in: ConnectionUpdate,
) -> Connection:
    update_payload = validate_updated_connection(connection, connection_in)
    for field, value in update_payload.items():
        setattr(connection, field, value)

    update_data = connection_in.model_dump(exclude_unset=True)
    if "password" in update_data:
        connection.encrypted_password = encrypt_password(update_data["password"])

    db.add(connection)
    db.commit()
    db.refresh(connection)
    return connection


def deactivate_connection(db: Session, connection: Connection) -> Connection:
    connection.status = "inactive"
    db.add(connection)
    db.commit()
    db.refresh(connection)
    return connection


def test_connection(db: Session, connection: Connection) -> Connection:
    tested_at = datetime.now(UTC)
    try:
        message = _run_connection_test(connection)
        connection.last_test_status = "success"
        connection.last_test_message = message
    except ConnectionTestError as exc:
        connection.last_test_status = "failed"
        connection.last_test_message = str(exc)
    except Exception as exc:
        connection.last_test_status = "failed"
        connection.last_test_message = f"Connection test failed: {exc}"

    connection.last_test_at = tested_at
    db.add(connection)
    db.commit()
    db.refresh(connection)
    return connection


def _run_connection_test(connection: Connection) -> str:
    if connection.type == "postgresql":
        return _test_postgresql(connection)
    if connection.type == "oracle":
        return _test_oracle(connection)
    if connection.type == "sqlserver":
        return _test_sqlserver(connection)
    if connection.type == "rest_api":
        return _test_rest_api(connection)
    if connection.type == "mqtt":
        return "MQTT connection metadata validated. Runtime MQTT test will be implemented later."
    raise ConnectionTestError(f"Unsupported connection type: {connection.type}")


def _test_postgresql(connection: Connection) -> str:
    password = decrypt_password(connection.encrypted_password)
    url = URL.create(
        "postgresql+psycopg",
        username=connection.username,
        password=password,
        host=connection.host,
        port=connection.port,
        database=connection.database_name,
    )
    engine = create_engine(url, pool_pre_ping=True)
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        raise ConnectionTestError(f"PostgreSQL connection failed: {exc}") from exc
    finally:
        engine.dispose()
    return "PostgreSQL connection test succeeded"


def _test_oracle(connection: Connection) -> str:
    try:
        import oracledb  # type: ignore[import-not-found]
    except Exception as exc:
        raise ConnectionTestError("Oracle driver is not available or not configured") from exc

    password = decrypt_password(connection.encrypted_password)
    dsn = oracledb.makedsn(connection.host, connection.port, service_name=connection.database_name)
    try:
        with oracledb.connect(user=connection.username, password=password, dsn=dsn) as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1 FROM DUAL")
                cursor.fetchone()
    except Exception as exc:
        raise ConnectionTestError(f"Oracle connection failed: {exc}") from exc
    return "Oracle connection test succeeded"


def _test_sqlserver(connection: Connection) -> str:
    try:
        import pyodbc  # type: ignore[import-not-found]
    except Exception as exc:
        raise ConnectionTestError("SQL Server driver is not available or not configured") from exc

    password = decrypt_password(connection.encrypted_password) or ""
    driver = (connection.config or {}).get("driver", "ODBC Driver 18 for SQL Server")
    connection_string = (
        f"DRIVER={{{driver}}};"
        f"SERVER={connection.host},{connection.port};"
        f"DATABASE={connection.database_name};"
        f"UID={connection.username};"
        f"PWD={password};"
        "TrustServerCertificate=yes;"
    )
    try:
        with pyodbc.connect(connection_string, timeout=5) as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
    except Exception as exc:
        raise ConnectionTestError(f"SQL Server connection failed: {exc}") from exc
    return "SQL Server connection test succeeded"


def _test_rest_api(connection: Connection) -> str:
    if not connection.base_url:
        raise ConnectionTestError("REST API connection requires base_url")
    try:
        response = httpx.get(connection.base_url, timeout=5.0)
    except Exception as exc:
        raise ConnectionTestError(f"REST API connection failed: {exc}") from exc
    return f"REST API responded with status code {response.status_code}"
