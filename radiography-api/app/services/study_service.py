from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.study import Study
from app.schemas.study import StudyCreate, StudyUpdate


class StudyService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: StudyCreate) -> Study:
        study = Study(**data.model_dump())
        self.db.add(study)
        await self.db.flush()
        await self.db.refresh(study)
        return study

    async def get(self, study_id: UUID) -> Study | None:
        result = await self.db.execute(select(Study).where(Study.id == study_id))
        return result.scalar_one_or_none()

    async def list(
        self,
        page: int = 1,
        page_size: int = 20,
        modality: str | None = None,
        status: str | None = None,
        urgent_only: bool = False,
    ) -> tuple[list[Study], int]:
        q = select(Study)
        if modality:
            q = q.where(Study.modality == modality)
        if status:
            q = q.where(Study.status == status)
        if urgent_only:
            q = q.where(Study.is_urgent == True)

        count_q = select(func.count()).select_from(q.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        q = (
            q.order_by(Study.is_urgent.desc(), Study.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        rows = (await self.db.execute(q)).scalars().all()
        return list(rows), total

    async def update(self, study_id: UUID, data: StudyUpdate) -> Study | None:
        study = await self.get(study_id)
        if not study:
            return None
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(study, field, value)
        await self.db.flush()
        await self.db.refresh(study)
        return study

    async def delete(self, study_id: UUID) -> bool:
        study = await self.get(study_id)
        if not study:
            return False
        await self.db.delete(study)
        return True