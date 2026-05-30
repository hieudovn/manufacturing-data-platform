import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator


ConnectionType = Literal["postgresql", "oracle", "sqlserver", "rest_api", "mqtt"]
ConnectionStatus = Literal["active", "inactive"]
DATABASE_CONNECTION_TYPES = {"postgresql", "oracle", "sqlserver"}


class ConnectionBase(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    type: ConnectionType
    description: str | None = None
    host: str | None = Field(default=None, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    database_name: str | None = Field(default=None, max_length=150)
    username: str | None = Field(default=None, max_length=150)
    base_url: HttpUrl | None = None
    mqtt_topic_prefix: str | None = Field(default=None, max_length=255)
    config: dict[str, Any] | None = None
    status: ConnectionStatus = "active"

    @model_validator(mode="after")
    def validate_required_fields(self) -> "ConnectionBase":
        if self.type in DATABASE_CONNECTION_TYPES:
            missing = [
                field
                for field in ("host", "port", "database_name", "username")
                if getattr(self, field) in (None, "")
            ]
            if missing:
                raise ValueError(
                    f"{self.type} connections require: {', '.join(missing)}"
                )
        if self.type == "rest_api" and self.base_url is None:
            raise ValueError("rest_api connections require base_url")
        if self.type == "mqtt":
            missing = [
                field
                for field in ("host", "port")
                if getattr(self, field) in (None, "")
            ]
            if missing:
                raise ValueError(f"mqtt connections require: {', '.join(missing)}")
        return self


class ConnectionCreate(ConnectionBase):
    password: str | None = Field(default=None, max_length=500)


class ConnectionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    type: ConnectionType | None = None
    description: str | None = None
    host: str | None = Field(default=None, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    database_name: str | None = Field(default=None, max_length=150)
    username: str | None = Field(default=None, max_length=150)
    password: str | None = Field(default=None, max_length=500)
    base_url: HttpUrl | None = None
    mqtt_topic_prefix: str | None = Field(default=None, max_length=255)
    config: dict[str, Any] | None = None
    status: ConnectionStatus | None = None


class ConnectionRead(ConnectionBase):
    id: uuid.UUID
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    last_test_status: str | None
    last_test_message: str | None
    last_test_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class ConnectionTestResponse(BaseModel):
    id: uuid.UUID
    status: str
    message: str
    tested_at: datetime
