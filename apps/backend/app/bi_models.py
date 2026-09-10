"""M3 planning/configuration; never replaces imported transaction facts."""
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base, utcnow


class SalesTarget(Base):
    __tablename__ = 'sales_target'
    __table_args__ = (UniqueConstraint('user_id', 'period_month'),
                     CheckConstraint('sales_amount_target >= 0', name='ck_target_amount'),
                     CheckConstraint('EXTRACT(DAY FROM period_month) = 1', name='ck_target_month'))
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('sys_user.id'))
    period_month: Mapped[date] = mapped_column(Date)
    sales_amount_target: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    remark: Mapped[str | None] = mapped_column(String(255))
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey('sys_user.id'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class BISetting(Base):
    __tablename__ = 'bi_setting'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB)


class SalesReview(Base):
    __tablename__ = 'sales_review'
    source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('data_source.id'), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB)
    facts_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_by: Mapped[uuid.UUID] = mapped_column(ForeignKey('sys_user.id'))
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
