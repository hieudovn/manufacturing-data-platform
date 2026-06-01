import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON, Uuid

from app.db.base import Base


jsonb_type = JSON().with_variant(JSONB, "postgresql")


class MigrationJob(Base):
    __tablename__ = "migration_jobs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(150), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_system: Mapped[str | None] = mapped_column(String(150), nullable=True, default="JDE Oracle")
    source_connection_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("connections.id"),
        nullable=True,
    )
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    migration_tool: Mapped[str] = mapped_column(String(50), nullable=False)
    source_schema: Mapped[str | None] = mapped_column(String(150), nullable=True)
    source_table: Mapped[str | None] = mapped_column(String(150), nullable=True)
    target_schema: Mapped[str] = mapped_column(String(150), nullable=False, default="mdp_staging")
    target_table: Mapped[str] = mapped_column(String(150), nullable=False)
    estimated_rows: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    estimated_size_gb: Mapped[float | None] = mapped_column(Float, nullable=True)
    primary_key_columns: Mapped[list[str] | None] = mapped_column(jsonb_type, nullable=True)
    load_mode: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active", server_default="active")
    config: Mapped[dict[str, Any] | None] = mapped_column(jsonb_type, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    runs: Mapped[list["MigrationRun"]] = relationship(
        back_populates="job",
        cascade="all, delete-orphan",
    )


class MigrationRun(Base):
    __tablename__ = "migration_runs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    migration_job_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("migration_jobs.id"),
        nullable=False,
        index=True,
    )
    run_type: Mapped[str] = mapped_column(String(50), nullable=False)
    trigger_type: Mapped[str] = mapped_column(String(50), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    source_row_count: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    target_row_count: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    rows_loaded: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    log_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    triggered_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    job: Mapped[MigrationJob] = relationship(back_populates="runs")
    validations: Mapped[list["MigrationValidation"]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
    )


class MigrationValidation(Base):
    __tablename__ = "migration_validations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    migration_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("migration_runs.id"),
        nullable=False,
        index=True,
    )
    check_name: Mapped[str] = mapped_column(String(150), nullable=False)
    source_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    target_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    run: Mapped[MigrationRun] = relationship(back_populates="validations")
