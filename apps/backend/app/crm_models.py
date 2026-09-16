"""CRM process data. ERP facts stay in their original namespace and history."""
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base, utcnow


class Assignment(Base):
    __tablename__ = 'customer_assignment_history'
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('customer.id'), index=True)
    from_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('sys_user.id'))
    to_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('sys_user.id'))
    action_type: Mapped[str] = mapped_column(String(24))
    reason: Mapped[str] = mapped_column(Text)
    operated_by: Mapped[uuid.UUID] = mapped_column(ForeignKey('sys_user.id'))
    operated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CustomerClaim(Base):
    """Non-exclusive claim (认养). One customer may be claimed by several salespeople."""
    __tablename__ = 'customer_claim'
    __table_args__ = (UniqueConstraint('customer_id', 'user_id', name='uq_customer_claim_once'),)
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('customer.id'), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('sys_user.id'), index=True)
    claimed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Contact(Base):
    __tablename__ = 'crm_contact'
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('customer.id'), index=True)
    name: Mapped[str] = mapped_column(String(100))
    role_label: Mapped[str | None] = mapped_column(String(64))
    decision_role: Mapped[str | None] = mapped_column(String(32))
    mobile: Mapped[str | None] = mapped_column(String(32), index=True)
    wechat: Mapped[str | None] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(255))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    relationship_note: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Tag(Base):
    __tablename__ = 'crm_tag'
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    tag_name: Mapped[str] = mapped_column(String(100), unique=True)
    tag_group: Mapped[str | None] = mapped_column(String(32))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey('sys_user.id'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CustomerTag(Base):
    __tablename__ = 'customer_tag_map'
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('customer.id'), primary_key=True)
    tag_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('crm_tag.id'), primary_key=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey('sys_user.id'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Followup(Base):
    __tablename__ = 'crm_followup'
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('customer.id'), index=True)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('crm_contact.id'))
    owner_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('sys_user.id'), index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    interaction_method: Mapped[str] = mapped_column(String(24))
    contact_result: Mapped[str] = mapped_column(String(32))
    is_effective: Mapped[bool | None] = mapped_column(Boolean)
    summary: Mapped[str | None] = mapped_column(Text)
    material_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    material_note: Mapped[str | None] = mapped_column(String(255))
    quotation_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    next_action: Mapped[str | None] = mapped_column(String(255))
    next_followup_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Opportunity(Base):
    __tablename__ = 'crm_opportunity'
    __table_args__ = (CheckConstraint('probability >= 0 AND probability <= 1', name='ck_crm_probability'),
                      CheckConstraint('estimated_amount >= 0', name='ck_crm_amount'))
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('customer.id'), index=True)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('sys_user.id'), index=True)
    opportunity_name: Mapped[str] = mapped_column(String(255))
    stage: Mapped[str] = mapped_column(String(24), default='initial')
    status: Mapped[str] = mapped_column(String(20), default='open')
    estimated_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    probability: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    expected_close_date: Mapped[date | None] = mapped_column(Date)
    need_summary: Mapped[str | None] = mapped_column(Text)
    lost_reason: Mapped[str | None] = mapped_column(String(255))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Task(Base):
    __tablename__ = 'crm_task'
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255))
    assignee_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('sys_user.id'), index=True)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('customer.id'), index=True)
    opportunity_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('crm_opportunity.id'))
    followup_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('crm_followup.id'), unique=True)
    source_type: Mapped[str] = mapped_column(String(24))
    task_type: Mapped[str | None] = mapped_column(String(32))
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    priority: Mapped[str] = mapped_column(String(16), default='normal')
    status: Mapped[str] = mapped_column(String(20), default='todo')
    completion_result: Mapped[str | None] = mapped_column(String(100))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey('sys_user.id'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class OpportunityProduct(Base):
    __tablename__ = 'crm_opportunity_product'
    opportunity_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('crm_opportunity.id'), primary_key=True)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('product.id'), primary_key=True, index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey('sys_user.id'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CRMSetting(Base):
    __tablename__ = 'crm_setting'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB)
