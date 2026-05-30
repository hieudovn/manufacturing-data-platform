import re
import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


SNAKE_CASE_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")
ALLOWED_DATA_TYPES = {"text", "integer", "float", "boolean", "date", "datetime", "json"}
SYSTEM_COLUMN_NAMES = {"id", "raw_payload", "created_at", "updated_at"}


class DataModelAttribute(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    display_name: str | None = Field(default=None, max_length=255)
    data_type: Literal["text", "integer", "float", "boolean", "date", "datetime", "json"]
    required: bool = False
    description: str | None = None
    source_path: str | None = None
    source_table: str | None = None
    source_column: str | None = None
    is_primary_key: bool = False
    is_foreign_key: bool = False
    reference_model: str | None = None
    reference_attribute: str | None = None
    sensitivity: str | None = None
    synonyms: list[str] | None = None

    @model_validator(mode="after")
    def validate_attribute_name(self) -> "DataModelAttribute":
        if not SNAKE_CASE_PATTERN.fullmatch(self.name):
            raise ValueError("Attribute name must be lowercase snake_case")
        return self


class DataModelBase(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    display_name: str = Field(min_length=1, max_length=255)
    type: Literal["A", "B"]
    category: str | None = Field(default=None, max_length=100)
    description: str | None = None
    business_definition: str | None = None
    owner_department: str | None = Field(default=None, max_length=150)
    source_system: str | None = Field(default=None, max_length=150)
    primary_key: str | None = Field(default=None, max_length=150)
    attributes: list[DataModelAttribute] = Field(min_length=1)
    relationships: list[dict[str, Any]] | None = None
    refresh_policy: str | None = Field(default=None, max_length=100)
    sensitivity_level: str = Field(default="internal", max_length=50)
    ai_enabled: bool = True
    status: str = Field(default="active", max_length=50)

    @model_validator(mode="after")
    def validate_model(self) -> "DataModelBase":
        if not SNAKE_CASE_PATTERN.fullmatch(self.name):
            raise ValueError("Data model name must be lowercase snake_case")

        attribute_names = [attribute.name for attribute in self.attributes]
        if len(attribute_names) != len(set(attribute_names)):
            raise ValueError("Attribute names must be unique")
        conflicting_columns = sorted(set(attribute_names).intersection(SYSTEM_COLUMN_NAMES))
        if conflicting_columns:
            raise ValueError(
                f"Attribute names conflict with system columns: {', '.join(conflicting_columns)}"
            )

        primary_attributes = [
            attribute.name for attribute in self.attributes if attribute.is_primary_key
        ]

        if self.primary_key and self.primary_key not in attribute_names:
            raise ValueError("primary_key must match one of the attribute names")

        if primary_attributes:
            if len(primary_attributes) > 1:
                raise ValueError("Only one attribute can be marked as primary key")
            if self.primary_key and self.primary_key != primary_attributes[0]:
                raise ValueError("primary_key must match the attribute marked as primary key")
            self.primary_key = primary_attributes[0]

        return self


class DataModelCreate(DataModelBase):
    pass


class DataModelUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    display_name: str | None = Field(default=None, min_length=1, max_length=255)
    type: Literal["A", "B"] | None = None
    category: str | None = Field(default=None, max_length=100)
    description: str | None = None
    business_definition: str | None = None
    owner_department: str | None = Field(default=None, max_length=150)
    source_system: str | None = Field(default=None, max_length=150)
    primary_key: str | None = Field(default=None, max_length=150)
    attributes: list[DataModelAttribute] | None = Field(default=None, min_length=1)
    relationships: list[dict[str, Any]] | None = None
    refresh_policy: str | None = Field(default=None, max_length=100)
    sensitivity_level: str | None = Field(default=None, max_length=50)
    ai_enabled: bool | None = None
    status: str | None = Field(default=None, max_length=50)

    @model_validator(mode="after")
    def validate_partial_names(self) -> "DataModelUpdate":
        if self.name is not None and not SNAKE_CASE_PATTERN.fullmatch(self.name):
            raise ValueError("Data model name must be lowercase snake_case")
        return self


class DataModelRead(DataModelBase):
    id: uuid.UUID
    generated_table: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
