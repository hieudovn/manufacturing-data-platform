import uuid
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.data_model import DataModel
from app.schemas.data_model import DataModelCreate, DataModelUpdate


def get_data_model(db: Session, data_model_id: uuid.UUID) -> DataModel | None:
    return db.get(DataModel, data_model_id)


def get_data_model_by_name(db: Session, name: str) -> DataModel | None:
    return db.scalar(select(DataModel).where(DataModel.name == name))


def list_data_models(
    db: Session,
    status: str | None = None,
    model_type: str | None = None,
    ai_enabled: bool | None = None,
) -> list[DataModel]:
    query = select(DataModel).order_by(DataModel.created_at.desc())
    if status is not None:
        query = query.where(DataModel.status == status)
    if model_type is not None:
        query = query.where(DataModel.type == model_type)
    if ai_enabled is not None:
        query = query.where(DataModel.ai_enabled == ai_enabled)
    return list(db.scalars(query))


def _attribute_payload(attributes: Any) -> list[dict[str, Any]]:
    return [
        attribute.model_dump(exclude_none=True)
        if hasattr(attribute, "model_dump")
        else dict(attribute)
        for attribute in attributes
    ]


def _payload_from_create(data_model_in: DataModelCreate) -> dict[str, Any]:
    payload = data_model_in.model_dump(exclude_none=True)
    payload["attributes"] = _attribute_payload(data_model_in.attributes)
    return payload


def _payload_from_model(data_model: DataModel) -> dict[str, Any]:
    return {
        "name": data_model.name,
        "display_name": data_model.display_name,
        "type": data_model.type,
        "category": data_model.category,
        "description": data_model.description,
        "business_definition": data_model.business_definition,
        "owner_department": data_model.owner_department,
        "source_system": data_model.source_system,
        "primary_key": data_model.primary_key,
        "attributes": data_model.attributes,
        "relationships": data_model.relationships,
        "refresh_policy": data_model.refresh_policy,
        "sensitivity_level": data_model.sensitivity_level,
        "ai_enabled": data_model.ai_enabled,
        "status": data_model.status,
    }


def validate_updated_data_model(
    data_model: DataModel,
    data_model_in: DataModelUpdate,
) -> dict[str, Any]:
    payload = _payload_from_model(data_model)
    update_data = data_model_in.model_dump(exclude_unset=True)
    payload.update(update_data)

    try:
        validated = DataModelCreate.model_validate(payload)
    except ValidationError:
        raise

    return _payload_from_create(validated)


def create_data_model(db: Session, data_model_in: DataModelCreate) -> DataModel:
    data_model = DataModel(**_payload_from_create(data_model_in))
    db.add(data_model)
    db.commit()
    db.refresh(data_model)
    return data_model


def update_data_model(
    db: Session,
    data_model: DataModel,
    data_model_in: DataModelUpdate,
) -> DataModel:
    update_payload = validate_updated_data_model(data_model, data_model_in)
    for field, value in update_payload.items():
        setattr(data_model, field, value)

    db.add(data_model)
    db.commit()
    db.refresh(data_model)
    return data_model


def deactivate_data_model(db: Session, data_model: DataModel) -> DataModel:
    data_model.status = "inactive"
    db.add(data_model)
    db.commit()
    db.refresh(data_model)
    return data_model
