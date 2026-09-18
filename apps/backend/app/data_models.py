"""M1 facts. Source snapshots and historical line versions are never overwritten."""
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base, utcnow


class DataSource(Base):
    __tablename__ = "data_source"
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    source_code: Mapped[str] = mapped_column(String(64), unique=True)
    source_name: Mapped[str] = mapped_column(String(100))
    entity_name: Mapped[str] = mapped_column(String(255))
    connector_type: Mapped[str] = mapped_column(String(16), default="excel")
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    config_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FieldMapping(Base):
    __tablename__ = "field_mapping"
    __table_args__ = (UniqueConstraint("data_source_id", "business_type", "version"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    data_source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("data_source.id"))
    business_type: Mapped[str] = mapped_column(String(24))
    version: Mapped[int] = mapped_column(Integer)
    specification: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ImportBatch(Base):
    __tablename__ = "import_batch"
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    data_source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("data_source.id"), index=True)
    business_type: Mapped[str] = mapped_column(String(24))
    original_filename: Mapped[str] = mapped_column(String(255))
    storage_path: Mapped[str] = mapped_column(Text)
    file_hash: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(24), default="pending")
    date_from: Mapped[date | None] = mapped_column(Date)
    date_to: Mapped[date | None] = mapped_column(Date)
    total_rows: Mapped[int] = mapped_column(Integer, default=0)
    success_rows: Mapped[int] = mapped_column(Integer, default=0)
    error_rows: Mapped[int] = mapped_column(Integer, default=0)
    imported_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("sys_user.id"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_summary: Mapped[str | None] = mapped_column(Text)
    preview: Mapped[dict] = mapped_column(JSONB, default=dict)
    normalized_data: Mapped[dict] = mapped_column(JSONB, default=dict)
    options: Mapped[dict] = mapped_column(JSONB, default=dict)
    duplicate_of: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("import_batch.id"))
    mapping_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("field_mapping.id"))


class RawImportRow(Base):
    __tablename__ = "raw_import_row"
    __table_args__ = (UniqueConstraint("import_batch_id", "sheet_name", "row_no"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    import_batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("import_batch.id"), index=True)
    sheet_name: Mapped[str] = mapped_column(String(255))
    row_no: Mapped[int] = mapped_column(Integer)
    raw_data: Mapped[dict] = mapped_column(JSONB)
    parse_status: Mapped[str] = mapped_column(String(24))
    error_message: Mapped[str | None] = mapped_column(Text)


class Customer(Base):
    __tablename__ = "customer"
    __table_args__ = (UniqueConstraint("source_system", "customer_code"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    source_system: Mapped[str] = mapped_column(String(64))
    customer_code: Mapped[str | None] = mapped_column(String(100))
    customer_name: Mapped[str] = mapped_column(String(255))
    normalized_name: Mapped[str] = mapped_column(String(255))
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("sys_user.id"), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    source_fields: Mapped[dict] = mapped_column(JSONB, default=dict)
    last_import_batch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("import_batch.id"))
    ownership_status: Mapped[str] = mapped_column(String(24), default='unassigned', server_default='unassigned')
    customer_type: Mapped[str | None] = mapped_column(String(32))
    customer_level: Mapped[str | None] = mapped_column(String(16))
    company_address: Mapped[str | None] = mapped_column(String(255))
    lifecycle_status: Mapped[str] = mapped_column(String(24), default='prospect', server_default='prospect')
    remark: Mapped[str | None] = mapped_column(Text)
    public_pool_entered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    bound_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    bound_customer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('customer.id'), unique=True)
    crm_managed: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Product(Base):
    __tablename__ = "product"
    __table_args__ = (UniqueConstraint("source_system", "product_code"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    source_system: Mapped[str] = mapped_column(String(64))
    product_code: Mapped[str] = mapped_column(String(100))
    product_name: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    source_fields: Mapped[dict] = mapped_column(JSONB, default=dict)
    last_import_batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("import_batch.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class SalesOrder(Base):
    __tablename__ = "sales_order"
    __table_args__ = (UniqueConstraint("source_system", "order_no"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    source_system: Mapped[str] = mapped_column(String(64))
    order_no: Mapped[str] = mapped_column(String(100))
    order_date: Mapped[date] = mapped_column(Date, index=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customer.id"), index=True)
    sales_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("sys_user.id"), index=True)
    sales_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    discount_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    net_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    received_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    payment_status: Mapped[str | None] = mapped_column(String(24))
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_status: Mapped[str] = mapped_column(String(32), default="unverified")
    version: Mapped[int] = mapped_column(Integer, default=1)
    content_hash: Mapped[str] = mapped_column(String(64))
    last_import_batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("import_batch.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class SalesOrderLine(Base):
    __tablename__ = "sales_order_line"
    __table_args__ = (UniqueConstraint("sales_order_id", "version", "line_no"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    sales_order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales_order.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    line_no: Mapped[int] = mapped_column(Integer)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("product.id"))
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    unit_name: Mapped[str | None] = mapped_column(String(100))
    unit_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    line_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    warehouse_name: Mapped[str | None] = mapped_column(String(255))
    actual_cost_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_import_batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("import_batch.id"))


class FinancialPeriod(Base):
    __tablename__ = "financial_period"
    __table_args__ = (UniqueConstraint("data_source_id", "period_month"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    data_source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("data_source.id"))
    period_month: Mapped[date] = mapped_column(Date)
    profit_import_batch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("import_batch.id"))
    balance_import_batch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("import_batch.id"))
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False)
    confirmed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("sys_user.id"))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class FinancialMetric(Base):
    __tablename__ = "financial_metric_monthly"
    __table_args__ = (UniqueConstraint("import_batch_id", "metric_code"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    period_month: Mapped[date] = mapped_column(Date)
    statement_type: Mapped[str] = mapped_column(String(24))
    metric_code: Mapped[str] = mapped_column(String(100))
    metric_name: Mapped[str] = mapped_column(String(255))
    period_value: Mapped[Decimal | None] = mapped_column(Numeric(20, 2))
    ytd_value: Mapped[Decimal | None] = mapped_column(Numeric(20, 2))
    begin_value: Mapped[Decimal | None] = mapped_column(Numeric(20, 2))
    end_value: Mapped[Decimal | None] = mapped_column(Numeric(20, 2))
    import_batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("import_batch.id"), index=True)
