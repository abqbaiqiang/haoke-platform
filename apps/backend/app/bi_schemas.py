from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Settings(Strict):
    work_week: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4], max_length=7)
    calendar: dict[date, bool] = Field(default_factory=dict, max_length=2000)
    personal_calendar: dict[UUID, dict[date, bool]] = Field(default_factory=dict, max_length=200)
    dormant_days: int = Field(90, ge=1, le=3650)
    lost_warning_days: int = Field(180, ge=2, le=7300)
    rfm_recent_days: int = Field(90, ge=1, le=3650)
    rfm_freq_orders: int = Field(2, ge=1, le=1000)
    followup_days: dict[Literal['A', 'B', 'C'], int] = Field(default_factory=dict)
    effective_activity_types: list[Literal['followup_create', 'followup_update', 'task_complete',
        'opportunity_create', 'opportunity_update', 'customer_update', 'contact_create', 'contact_update']] = Field(
        default_factory=lambda: ['followup_create', 'task_complete', 'opportunity_create', 'opportunity_update'])
    cancelled_tasks: Literal['include', 'exclude'] | None = None

    @model_validator(mode='after')
    def boundaries(self):
        if len(set(self.work_week)) != len(self.work_week) or any(d not in range(7) for d in self.work_week):
            raise ValueError('工作星期必须是去重的 0–6')
        if self.lost_warning_days <= self.dormant_days:
            raise ValueError('疑似流失阈值必须大于沉睡阈值')
        if any(not 1 <= n <= 3650 for n in self.followup_days.values()):
            raise ValueError('跟进阈值须为 1–3650 天')
        if any(len(days) > 1000 for days in self.personal_calendar.values()):
            raise ValueError('单人日历例外过多')
        return self


class TargetInput(Strict):
    amount: Decimal = Field(ge=0, max_digits=18, decimal_places=2)
    remark: str | None = Field(None, max_length=255)


class ReviewInput(Strict):
    coverage_from: date
    coverage_to: date
    valid_statuses: list[str] = Field(min_length=1, max_length=20)
    excluded_statuses: list[str] = Field(default_factory=lambda: ['void', 'cancelled'], max_length=20)
    return_statuses: list[str] = Field(default_factory=lambda: ['return'], max_length=20)
    staff_mapping_complete: bool = False
    full_history: bool = False
    reason: str = Field(min_length=5, max_length=1000)
    acknowledge_export_scope: bool

    @model_validator(mode='after')
    def boundaries(self):
        if self.coverage_to < self.coverage_from or not self.acknowledge_export_scope:
            raise ValueError('必须确认有效单据、退货/作废和完整导出期间')
        groups = [self.valid_statuses, self.excluded_statuses, self.return_statuses]
        flat = [s for group in groups for s in group]
        if len(set(flat)) != len(flat) or any(not s.strip() or len(s) > 32 for s in flat):
            raise ValueError('状态映射不得重复、交叉或为空')
        return self


class Metric(BaseModel):
    definition: str = ""
    source: str = ""
    code: str
    label: str
    value: str | None
    unit: Literal['元', '%', '天', '个', '次', '单', 'SKU', '百分点'] = '元'
    reason: str | None = None


class Person(BaseModel):
    id: UUID
    name: str


class TargetView(BaseModel):
    user_id: UUID
    month: date
    amount: str | None
    remark: str | None = None
    target_type: str = 'monthly'


class SourceView(BaseModel):
    id: UUID
    name: str


class Point(BaseModel):
    date: date
    value: str


class DimensionRow(BaseModel):
    id: str
    name: str
    current: str
    previous: str | None
    change: str | None
    orders: int = 0
    customers: int = 0
    quantity: str | None = None
    unit: str | None = None
    average_price: str | None = None


class Analysis(BaseModel):
    month: date
    through: date
    previous_month: date
    basis: str
    verified: bool
    warnings: list[str]
    updated_at: datetime | None
    metrics: list[Metric]
    trend: list[Point]
    rows: list[DimensionRow]
    total_rows: int
    total_change: str | None
    other_change: str | None
    line_difference: str | None = None


class Attention(BaseModel):
    id: UUID
    name: str
    kind: str
    days: int | None = None


class AttentionPage(BaseModel):
    rows: list[Attention]
    total: int
    warnings: list[str]
    counts: dict[str, int] = {}


class Workbench(BaseModel):
    user_id: UUID
    name: str
    month: date
    through: date
    metrics: list[Metric]
    warnings: list[str]
    today_tasks: int
    week_tasks: int
    overdue_tasks: int
    open_opportunities: int


class Team(BaseModel):
    rows: list[Workbench]
    total: int


class OrderRow(BaseModel):
    id: UUID
    number: str
    date: date
    amount: str
    status: str


class OrderPage(BaseModel):
    rows: list[OrderRow]
    total: int


class ProductMarginRow(BaseModel):
    product_id: UUID
    name: str
    quantity: str
    sales: str
    cost: str | None
    profit: str | None
    rate: str | None


class ProductMarginPage(BaseModel):
    month: date
    through: date
    basis: str
    warnings: list[str]
    metrics: list[Metric]
    total_sales: str
    total_cost: str | None
    total_profit: str | None
    margin_rate: str | None
    cost_coverage: str | None
    rows: list[ProductMarginRow]
    total: int


class StructureSlice(BaseModel):
    label: str
    amount: str
    share: str | None = None


class PersonRankRow(BaseModel):
    user_id: UUID
    name: str
    amount: str
    target: str | None = None
    completion: str | None = None


class AttentionItem(BaseModel):
    customer_id: UUID
    name: str
    kind: str
    days: int | None = None


class CustomerContribution(BaseModel):
    customer_id: UUID
    name: str
    owner_name: str | None = None
    level: str | None = None
    amount: str
    orders: int


class Overview(BaseModel):
    month: date
    through: date
    verified: bool
    warnings: list[str]
    finance_warnings: list[str]
    sales_metrics: list[Metric]
    finance_metrics: list[Metric]
    trend: list[Point]
    customer_trend: list[Point] = []
    customer_contributions: list[CustomerContribution] = []
    updated_at: datetime | None
    customer_structure: list[StructureSlice] = []
    product_structure: list[StructureSlice] = []
    person_ranking: list[PersonRankRow] = []
    attention_items: list[AttentionItem] = []
    attention_total: int = 0


class SegmentRow(BaseModel):
    layer: str
    hint: str
    count: int = 0
    amount: str = '0.00'
    share: str | None = None


class CustomerTrendMonth(BaseModel):
    month: date
    amount: str
    orders: int
    customers: int
    repeat_rate: str | None = None
    aov: str | None = None


class ConvertBucket(BaseModel):
    label: str
    count: int = 0


class CustomerTopRow(BaseModel):
    customer_id: UUID
    name: str
    layer: str
    last_order_date: date | None = None
    days_since: int | None = None
    orders: int = 0
    amount: str = '0.00'
    aov: str | None = None


class CustomerAnalytics(BaseModel):
    through: date
    basis: str
    verified: bool
    warnings: list[str]
    metrics: list[Metric]
    segments: list[SegmentRow]
    trend: list[CustomerTrendMonth]
    conversion_counted: int = 0
    conversion_average_days: str | None = None
    conversion_buckets: list[ConvertBucket] = []
    top: list[CustomerTopRow] = []
    total: int = 0


class CustomerProfile(BaseModel):
    customer_id: UUID
    name: str
    layer: str | None = None
    days_since: int | None = None
    last_order_date: date | None = None
    orders: int = 0
    amount: str = '0.00'
    aov: str | None = None
    is_repeat: bool = False
    convert_days: int | None = None
    warnings: list[str] = []
