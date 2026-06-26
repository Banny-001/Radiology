import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


class Study(Base):
    __tablename__ = "studies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # ── Patient demographics ──────────────────────────────────────────────
    patient_name = Column(String, nullable=False)
    patient_id = Column(String, nullable=False)
    date_of_birth = Column(String, nullable=True)
    sex = Column(String(1), nullable=True)

    # ── Study metadata ────────────────────────────────────────────────────
    modality = Column(String, nullable=False)
    description = Column(String, nullable=False)
    referring_doctor = Column(String, nullable=True)
    institution = Column(String, nullable=True)
    clinical_history = Column(Text, nullable=True)
    is_urgent = Column(Boolean, default=False, nullable=False)
    status = Column(String, default="pending", nullable=False)

    # ── DICOM storage ─────────────────────────────────────────────────────
    dicom_path = Column(String, nullable=True)
    number_of_images = Column(Integer, default=0, nullable=False)
    study_instance_uid = Column(String, nullable=True)
    accession_number = Column(String, nullable=True)

    # ── AI reporting ──────────────────────────────────────────────────────
    ai_report = Column(Text, nullable=True)
    ai_confidence = Column(String, nullable=True)

    # ── Timestamps ────────────────────────────────────────────────────────
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )