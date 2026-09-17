from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

Name = Annotated[str, Field(min_length=1, max_length=255)]
Note = Annotated[str, Field(max_length=4000)]
Amount = Annotated[Decimal, Field(ge=0, max_digits=18, decimal_places=2)]
Probability = Annotated[Decimal, Field(ge=0, le=1, max_digits=5, decimal_places=4)]


class DTO(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True, from_attributes=True)


class CustomerCreate(DTO):
    customer_name: Name
    mobile: Annotated[str, Field(max_length=32)] | None = None
    remark: Note | None = None


class CustomerPatch(DTO):
    customer_name: Name | None = None
    customer_type: Annotated[str, Field(max_length=32)] | None = None
    customer_level: Literal['A', 'B', 'C', 'D'] | None = None
    customer_status: Literal['potential', 'contacted', 'demand', 'quoted', 'won', 'dormant'] | None = None
    lifecycle_status: Literal['prospect', 'active', 'dormant', 'lost'] | None = None
    remark: Note | None = None


class ClaimView(DTO):
    user_id: UUID
    display_name: str
    claimed_at: datetime


class CustomerView(DTO):
    id: UUID
    source_system: str
    customer_code: str | None
    customer_name: str
    owner_user_id: UUID | None
    ownership_status: str
    customer_type: str | None
    customer_level: str | None
    customer_status: str | None
    lifecycle_status: str
    remark: str | None
    bound_customer_id: UUID | None
    bound_at: datetime | None
    created_at: datetime
    is_active: bool
    claims: list[ClaimView] = []


class Transfer(DTO):
    owner_user_id: UUID | None
    reason: Annotated[str, Field(min_length=1, max_length=500)]


class BatchAssign(DTO):
    customer_ids: Annotated[list[UUID], Field(min_length=1, max_length=1000)]
    owner_user_id: UUID
    reason: Annotated[str, Field(min_length=1, max_length=500)]


class BatchAssignResult(DTO):
    assigned_count: int


class BatchClaim(DTO):
    customer_ids: Annotated[list[UUID], Field(min_length=1, max_length=1000)]


class BatchClaimResult(DTO):
    claimed_count: int
    skipped: list[str] = []


class Bind(DTO):
    target_id: UUID


class VoidInput(DTO):
    reason: Annotated[str, Field(min_length=1, max_length=500)]


class ContactInput(DTO):
    name: Annotated[str, Field(min_length=1, max_length=100)]
    role_label: Annotated[str, Field(max_length=64)] | None = None
    decision_role: Literal['decision_maker', 'buyer', 'boss', 'finance', 'influencer', 'user', 'key_relationship', 'introducer', 'other'] | None = None
    mobile: Annotated[str, Field(max_length=32)] | None = None
    wechat: Annotated[str, Field(max_length=100)] | None = None
    email: Annotated[str, Field(max_length=255)] | None = None
    is_primary: bool = False
    relationship_note: Note | None = None
    is_active: bool = True


class ContactView(ContactInput):
    id: UUID
    customer_id: UUID


class TagInput(DTO):
    tag_name: Annotated[str, Field(min_length=1, max_length=100)]
    tag_group: Annotated[str, Field(max_length=32)] | None = None
    is_active: bool = True


class TagView(TagInput):
    id: UUID
    created_by: UUID | None = None


class TagsInput(DTO):
    tag_ids: Annotated[list[UUID], Field(max_length=30)]


class FollowupInput(DTO):
    contact_id: UUID | None = None
    occurred_at: AwareDatetime | None = None
    interaction_method: Literal['phone', 'wechat', 'visit', 'meeting', 'quote', 'other']
    contact_result: Literal['no_answer', 'good', 'normal', 'no_need', 'waiting', 'rejected', 'won', 'other']
    is_effective: bool | None = None
    summary: Note | None = None
    material_sent: bool = False
    material_note: Annotated[str, Field(max_length=255)] | None = None
    quotation_sent: bool = False
    next_action: Name | None = None
    next_followup_at: AwareDatetime | None = None

    @model_validator(mode='after')
    def next_step(self):
        if bool(self.next_action) != bool(self.next_followup_at):
            raise ValueError('下一步动作与时间需同时填写')
        return self


class FollowupView(FollowupInput):
    id: UUID
    customer_id: UUID
    owner_user_id: UUID
    created_at: datetime
    is_active: bool


class TaskInput(DTO):
    title: Name
    assignee_user_id: UUID
    customer_id: UUID | None = None
    opportunity_id: UUID | None = None
    due_at: AwareDatetime
    priority: Literal['low', 'normal', 'high', 'urgent'] = 'normal'
    task_type: Literal['followup', 'quote', 'collection', 'material', 'meeting', 'other'] = 'other'


class TaskPatch(DTO):
    status: Literal['todo', 'done', 'cancelled'] | None = None
    due_at: AwareDatetime | None = None
    completion_result: Annotated[str, Field(max_length=100)] | None = None


class TaskView(TaskInput):
    id: UUID
    source_type: str
    status: str
    completion_result: str | None
    completed_at: datetime | None
    followup_id: UUID | None


class ProductRef(DTO):
    id: UUID
    name: str


class OpportunityInput(DTO):
    opportunity_name: Name
    owner_user_id: UUID
    # 阶段枚举（docs/31 第 2.A 节）：接触客户→推荐产品→选品→招投标→大单议价→交付→成交/流失；保留“大单议价”字眼。
    stage: Literal['contact', 'recommend', 'selection', 'bidding', 'negotiation', 'delivery', 'won', 'lost'] = 'contact'
    project_id: UUID | None = None
    estimated_amount: Amount | None = None
    probability: Probability | None = None
    expected_close_date: date | None = None
    planned_contact_date: date | None = None
    planned_recommend_date: date | None = None
    planned_selection_date: date | None = None
    planned_bidding_date: date | None = None
    planned_negotiation_date: date | None = None
    planned_delivery_date: date | None = None
    delivery_ratio: Annotated[Decimal, Field(ge=0, le=100, max_digits=5, decimal_places=2)] | None = None
    need_summary: Note | None = None
    lost_reason: Annotated[str, Field(max_length=255)] | None = None
    current_blocker: Annotated[str, Field(max_length=255)] | None = None
    next_promotion: Annotated[str, Field(max_length=500)] | None = None
    product_ids: Annotated[list[UUID], Field(max_length=50)] = []


class OpportunityView(OpportunityInput):
    id: UUID
    customer_id: UUID
    status: str
    weighted_amount: str | None = None
    closed_at: datetime | None
    products: list[ProductRef] = []


class Settings(DTO):
    sales_create_tags: bool = True
    allow_prospect_create: bool = False
    followup_edit_hours: int = Field(default=24, ge=0, le=720)
    public_pool_claim_enabled: bool = True


class Person(DTO):
    id: UUID
    display_name: str
    username: str


class Event(DTO):
    id: UUID
    activity_type: str
    occurred_at: datetime
    user_id: UUID
    details: dict | None


class OrderSummary(DTO):
    id: UUID
    order_no: str
    order_date: date
    sales_amount: Decimal


class CustomerPage(DTO):
    rows: list[CustomerView]
    total: int


class CustomerCreated(DTO):
    customer: CustomerView
    duplicate_warning: bool


class PoolItem(DTO):
    customer_name: Name
    mobile: Annotated[str, Field(max_length=32)] | None = None
    remark: Note | None = None


class PoolImport(DTO):
    items: Annotated[list[PoolItem], Field(min_length=1, max_length=500)]


class PoolImportResult(DTO):
    created_count: int
    duplicate_names: list[str] = []


class CustomerDetail(DTO):
    customer: CustomerView
    contacts: list[ContactView]
    tags: list[TagView]
    followups: list[FollowupView]
    tasks: list[TaskView]
    opportunities: list[OpportunityView]
    events: list[Event]
    orders: list[OrderSummary]
    has_more_history: bool
    sales_summary: 'SalesSummary'


class ProductSummary(DTO):
    name: str
    amount: str


class SalesSummary(DTO):
    metric_code: Literal['DQ_SALES_RECON']
    order_count: int
    total_amount: str
    year_amount: str
    last_order_date: date | None
    top_products: list[ProductSummary]
