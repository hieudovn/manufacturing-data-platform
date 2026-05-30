import json
import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.data_model import DataModel
from app.services.data_model_service import get_data_model_by_name
from app.services.inbound_service import validate_scalar_value
from app.services.table_generator import (
    TableGenerationError,
    get_generated_table_name,
    quote_identifier,
    validate_generated_column_names,
    validate_identifier,
)
from app.services.transaction_logger import log_transaction


RESERVED_QUERY_PARAMS = {"limit", "offset", "include_meta", "include_raw"}


class OutboundValidationError(Exception):
    def __init__(self, errors: list[dict[str, str]]) -> None:
        self.errors = errors
        super().__init__("Outbound query validation failed")


class OutboundQueryError(Exception):
    pass


def get_active_data_model_by_name(db: Session, model_name: str) -> DataModel | None:
    model = get_data_model_by_name(db, model_name)
    if model is None or model.status != "active":
        return None
    return model


def attribute_map(model: DataModel) -> dict[str, dict[str, Any]]:
    validate_generated_column_names(model.attributes)
    return {attribute["name"]: attribute for attribute in model.attributes}


def coerce_filter_value(attribute: dict[str, Any], raw_value: str) -> Any:
    data_type = attribute["data_type"]
    if data_type == "integer":
        try:
            value: Any = int(raw_value)
        except ValueError as exc:
            raise OutboundValidationError(
                [{"field": attribute["name"], "message": "must be an integer"}]
            ) from exc
    elif data_type == "float":
        try:
            value = float(raw_value)
        except ValueError as exc:
            raise OutboundValidationError(
                [{"field": attribute["name"], "message": "must be a number"}]
            ) from exc
    elif data_type == "boolean":
        lowered = raw_value.lower()
        if lowered not in {"true", "false"}:
            raise OutboundValidationError(
                [{"field": attribute["name"], "message": "must be true or false"}]
            )
        value = lowered == "true"
    elif data_type == "json":
        try:
            value = json.loads(raw_value)
        except json.JSONDecodeError as exc:
            raise OutboundValidationError(
                [{"field": attribute["name"], "message": "must be valid JSON"}]
            ) from exc
    else:
        value = raw_value

    error = validate_scalar_value(attribute["name"], data_type, value)
    if error is not None:
        raise OutboundValidationError([error])
    return value


def selected_columns(
    model: DataModel,
    *,
    include_meta: bool,
    include_raw: bool,
) -> list[str]:
    columns = [attribute["name"] for attribute in model.attributes]
    if include_meta:
        columns = ["id", "created_at", "updated_at", *columns]
    if include_raw:
        columns = [*columns, "raw_payload"]
    return columns


def normalize_row(row: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(row)
    if "id" in normalized and isinstance(normalized["id"], uuid.UUID):
        normalized["id"] = str(normalized["id"])
    if isinstance(normalized.get("raw_payload"), str):
        try:
            normalized["raw_payload"] = json.loads(normalized["raw_payload"])
        except json.JSONDecodeError:
            pass
    return normalized


def query_outbound_records(
    db: Session,
    *,
    model: DataModel,
    filters: dict[str, str],
    limit: int,
    offset: int,
    include_meta: bool,
    include_raw: bool,
) -> list[dict[str, Any]]:
    attributes = attribute_map(model)
    invalid_filters = sorted(set(filters).difference(attributes))
    if invalid_filters:
        raise OutboundValidationError(
            [
                {"field": field, "message": "filter is not defined on this data model"}
                for field in invalid_filters
            ]
        )

    table_name = model.generated_table or get_generated_table_name(model.name)
    schema_name, bare_table_name = table_name.split(".", 1)
    validate_identifier(model.name, "Data model name")
    validate_identifier(schema_name, "Schema name")
    validate_identifier(bare_table_name, "Table name")
    quoted_table = f"{quote_identifier(schema_name)}.{quote_identifier(bare_table_name)}"

    columns = selected_columns(model, include_meta=include_meta, include_raw=include_raw)
    for column in columns:
        validate_identifier(column, "Column name")
    select_clause = ", ".join(quote_identifier(column) for column in columns)

    where_clauses: list[str] = []
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    is_postgres = bool(db.bind and db.bind.dialect.name == "postgresql")
    for index, (field, raw_value) in enumerate(filters.items()):
        attribute = attributes[field]
        param_name = f"filter_{index}"
        value = coerce_filter_value(attribute, raw_value)
        where_clauses.append(f"{quote_identifier(field)} = :{param_name}")
        params[param_name] = json.dumps(value) if attribute["data_type"] == "json" else value
        if attribute["data_type"] == "json" and is_postgres:
            where_clauses[-1] = f"{quote_identifier(field)} = CAST(:{param_name} AS JSONB)"

    where_sql = f" WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    statement = text(
        f"SELECT {select_clause} FROM {quoted_table}{where_sql} "
        "ORDER BY created_at DESC LIMIT :limit OFFSET :offset"
    )
    rows = db.execute(statement, params).mappings().all()
    return [normalize_row(dict(row)) for row in rows]


def query_outbound_record_by_key(
    db: Session,
    *,
    model: DataModel,
    key: str,
    include_meta: bool,
    include_raw: bool,
) -> dict[str, Any] | None:
    if not model.primary_key:
        raise ValueError("No primary_key configured for this data model")

    attributes = attribute_map(model)
    primary_attribute = attributes[model.primary_key]
    value = coerce_filter_value(primary_attribute, key)
    records = query_outbound_records(
        db,
        model=model,
        filters={model.primary_key: str(value).lower() if isinstance(value, bool) else str(value)},
        limit=1,
        offset=0,
        include_meta=include_meta,
        include_raw=include_raw,
    )
    return records[0] if records else None


def validate_outbound_model(db: Session, model_name: str, payload: dict[str, Any]) -> DataModel:
    try:
        validate_identifier(model_name, "Data model name")
    except TableGenerationError as exc:
        raise OutboundValidationError([{"field": "model_name", "message": str(exc)}]) from exc

    model = get_active_data_model_by_name(db, model_name)
    if model is None:
        raise LookupError("Data model not found")
    if model.type != "A":
        log_transaction(
            db,
            direction="outbound",
            protocol="rest",
            data_model_id=model.id,
            endpoint=str(payload.get("path", "")),
            status="failed",
            request_payload=payload,
            error_message="Outbound API for Type B data models is not supported yet",
            source_system=model.source_system,
        )
        db.commit()
        raise ValueError("Outbound API for Type B data models is not supported yet")
    return model


def list_outbound(
    db: Session,
    *,
    model_name: str,
    query_params: dict[str, str],
    endpoint: str,
    limit: int,
    offset: int,
    include_meta: bool,
    include_raw: bool,
) -> dict[str, Any]:
    request_payload = {"path": endpoint, "query_params": query_params}
    model = validate_outbound_model(db, model_name, request_payload)
    filters = {
        key: value for key, value in query_params.items() if key not in RESERVED_QUERY_PARAMS
    }

    try:
        records = query_outbound_records(
            db,
            model=model,
            filters=filters,
            limit=limit,
            offset=offset,
            include_meta=include_meta,
            include_raw=include_raw,
        )
        response_payload = {
            "status": "success",
            "model": model.name,
            "count": len(records),
            "limit": limit,
            "offset": offset,
            "data": records,
        }
        log_transaction(
            db,
            direction="outbound",
            protocol="rest",
            data_model_id=model.id,
            endpoint=endpoint,
            status="success",
            request_payload=request_payload,
            response_payload={"count": len(records), "model": model.name},
            source_system=model.source_system,
        )
        db.commit()
        return response_payload
    except OutboundValidationError as exc:
        db.rollback()
        log_transaction(
            db,
            direction="outbound",
            protocol="rest",
            data_model_id=model.id,
            endpoint=endpoint,
            status="failed",
            request_payload=request_payload,
            error_message=json.dumps(exc.errors),
            source_system=model.source_system,
        )
        db.commit()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        message = f"Failed to query outbound data: {exc.__class__.__name__}"
        log_transaction(
            db,
            direction="outbound",
            protocol="rest",
            data_model_id=model.id,
            endpoint=endpoint,
            status="failed",
            request_payload=request_payload,
            error_message=message,
            source_system=model.source_system,
        )
        db.commit()
        raise OutboundQueryError(message) from exc


def get_outbound_by_key(
    db: Session,
    *,
    model_name: str,
    key: str,
    query_params: dict[str, str],
    endpoint: str,
    include_meta: bool,
    include_raw: bool,
) -> dict[str, Any]:
    request_payload = {"path": endpoint, "query_params": query_params}
    model = validate_outbound_model(db, model_name, request_payload)

    try:
        record = query_outbound_record_by_key(
            db,
            model=model,
            key=key,
            include_meta=include_meta,
            include_raw=include_raw,
        )
        if record is None:
            raise LookupError("Record not found")
        response_payload = {
            "status": "success",
            "model": model.name,
            "key": key,
            "data": record,
        }
        log_transaction(
            db,
            direction="outbound",
            protocol="rest",
            data_model_id=model.id,
            endpoint=endpoint,
            status="success",
            request_payload=request_payload,
            response_payload={"count": 1, "model": model.name},
            source_system=model.source_system,
        )
        db.commit()
        return response_payload
    except (OutboundValidationError, ValueError, LookupError) as exc:
        db.rollback()
        log_transaction(
            db,
            direction="outbound",
            protocol="rest",
            data_model_id=model.id,
            endpoint=endpoint,
            status="failed",
            request_payload=request_payload,
            error_message=str(exc),
            source_system=model.source_system,
        )
        db.commit()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        message = f"Failed to query outbound data: {exc.__class__.__name__}"
        log_transaction(
            db,
            direction="outbound",
            protocol="rest",
            data_model_id=model.id,
            endpoint=endpoint,
            status="failed",
            request_payload=request_payload,
            error_message=message,
            source_system=model.source_system,
        )
        db.commit()
        raise OutboundQueryError(message) from exc
