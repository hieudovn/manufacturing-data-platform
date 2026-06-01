import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


SourceType = Literal["oracle", "postgresql", "sqlserver", "external"]
MigrationTool = Literal["ora2pg", "manual", "external_tool", "native_small_table"]
LoadMode = Literal["full_load", "incremental", "external_bulk", "validation_only"]
RunType = Literal["full_load", "incremental", "validation_only", "external_bulk"]
TriggerType = Literal["manual", "external", "scheduled"]
RunStatus = Literal["pending", "running", "success", "failed", "cancelled"]
ValidationStatus = Literal["pass", "warning", "fail"]


class MigrationJobBase(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str | None = None
    source_system: str | None = Field(default="JDE Oracle", max_length=150)
    source_connection_id: uuid.UUID | None = None
    source_type: SourceType
    migration_tool: MigrationTool
    source_schema: str | None = Field(default=None, max_length=150)
    source_table: str | None = Field(default=None, max_length=150)
    target_schema: str = Field(default="mdp_staging", min_length=1, max_length=150)
    target_table: str = Field(min_length=1, max_length=150)
    estimated_rows: int | None = Field(default=None, ge=0)
    estimated_size_gb: float | None = Field(default=None, ge=0)
    primary_key_columns: list[str] | None = None
    load_mode: LoadMode
    status: str = Field(default="active", max_length=50)
    config: dict[str, Any] | None = None

    @model_validator(mode="after")
    def warn_native_small_table_tooling(self) -> "MigrationJobBase":
        if self.migration_tool == "native_small_table" and self.estimated_rows and self.estimated_rows > 100_000:
            raise ValueError(
                "native_small_table is only for small/manual tests; use ora2pg or external_tool for large JDE tables"
            )
        return self


class MigrationJobCreate(MigrationJobBase):
    pass


class MigrationJobUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None
    source_system: str | None = Field(default=None, max_length=150)
    source_connection_id: uuid.UUID | None = None
    source_type: SourceType | None = None
    migration_tool: MigrationTool | None = None
    source_schema: str | None = Field(default=None, max_length=150)
    source_table: str | None = Field(default=None, max_length=150)
    target_schema: str | None = Field(default=None, min_length=1, max_length=150)
    target_table: str | None = Field(default=None, min_length=1, max_length=150)
    estimated_rows: int | None = Field(default=None, ge=0)
    estimated_size_gb: float | None = Field(default=None, ge=0)
    primary_key_columns: list[str] | None = None
    load_mode: LoadMode | None = None
    status: str | None = Field(default=None, max_length=50)
    config: dict[str, Any] | None = None


class MigrationRunCreate(BaseModel):
    run_type: RunType = "external_bulk"
    trigger_type: TriggerType = "external"
    started_at: datetime | None = None
    finished_at: datetime | None = None
    status: RunStatus = "pending"
    source_row_count: int | None = Field(default=None, ge=0)
    target_row_count: int | None = Field(default=None, ge=0)
    rows_loaded: int | None = Field(default=None, ge=0)
    duration_seconds: int | None = Field(default=None, ge=0)
    log_text: str | None = None
    error_message: str | None = None


class MigrationRunUpdate(BaseModel):
    run_type: RunType | None = None
    trigger_type: TriggerType | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    status: RunStatus | None = None
    source_row_count: int | None = Field(default=None, ge=0)
    target_row_count: int | None = Field(default=None, ge=0)
    rows_loaded: int | None = Field(default=None, ge=0)
    duration_seconds: int | None = Field(default=None, ge=0)
    log_text: str | None = None
    error_message: str | None = None


class MigrationValidationRead(BaseModel):
    id: uuid.UUID
    migration_run_id: uuid.UUID
    check_name: str
    source_value: str | None
    target_value: str | None
    status: str
    message: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MigrationRunRead(BaseModel):
    id: uuid.UUID
    migration_job_id: uuid.UUID
    run_type: str
    trigger_type: str
    started_at: datetime | None
    finished_at: datetime | None
    status: str
    source_row_count: int | None
    target_row_count: int | None
    rows_loaded: int | None
    duration_seconds: int | None
    log_text: str | None
    error_message: str | None
    triggered_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MigrationJobRead(MigrationJobBase):
    id: uuid.UUID
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    latest_run_status: str | None = None
    latest_target_row_count: int | None = None

    model_config = ConfigDict(from_attributes=True)


class TargetValidationResponse(BaseModel):
    status: str
    migration_run_id: uuid.UUID
    target_schema: str
    target_table: str
    target_row_count: int | None
    validations: list[MigrationValidationRead]
    sample_rows: list[dict[str, Any]]
