import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.session import Base


class Study(Base):
    __tablename__ = "studies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_name: Mapped[str] = mapped_column(String(255), nullable=False)
    patient_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    date_of_birth: Mapped[str | None] = mapped_column(String(10))
    sex: Mapped[str | None] = mapped_column(String(10))
    modality: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    referring_doctor: Mapped[str | None] = mapped_column(String(255))
    institution: Mapped[str | None] = mapped_column(String(255))
    clinical_history: Mapped[str | None] = mapped_column(Text)
    study_instance_uid: Mapped[str | None] = mapped_column(String(64), unique=True)
    accession_number: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(
        Enum("pending", "in_progress", "reported", "verified", name="study_status"),
        default="pending",
        index=True,
    )
    is_urgent: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    dicom_path: Mapped[str | None] = mapped_column(String(512))
    ai_report: Mapped[str | None] = mapped_column(Text)
    ai_confidence: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    number_of_images: Mapped[int] = mapped_column(default=0)