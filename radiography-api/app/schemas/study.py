from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class StudyCreate(BaseModel):
    patient_name: str = Field(..., min_length=1)
    patient_id: str = Field(..., min_length=1)
    date_of_birth: str | None = None
    sex: str | None = None
    modality: str
    description: str
    referring_doctor: str | None = None
    institution: str | None = None
    clinical_history: str | None = None
    is_urgent: bool = False


class StudyUpdate(BaseModel):
    status: str | None = None
    referring_doctor: str | None = None
    clinical_history: str | None = None
    is_urgent: bool | None = None
    ai_report: str | None = None
    ai_confidence: str | None = None
    dicom_path: str | None = None
    number_of_images: int | None = None  # incremented on each .dcm upload


class StudyOut(BaseModel):
    id: UUID
    patient_name: str
    patient_id: str
    date_of_birth: str | None
    sex: str | None
    modality: str
    description: str
    referring_doctor: str | None
    institution: str | None
    clinical_history: str | None
    study_instance_uid: str | None
    accession_number: str | None
    status: str
    is_urgent: bool
    ai_report: str | None
    ai_confidence: str | None
    dicom_path: str | None
    number_of_images: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class StudyListOut(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[StudyOut]