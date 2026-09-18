"""Sales-only presentation queries; existing CRM ownership and metric definitions remain authoritative."""
import base64
import binascii
import hashlib
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Literal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import case, exists, func, or_, select

from app import bi_service as bi, crm_schemas as dto, crm_service as crm
from app.config import get_settings
from app.crm_models import Contact, CustomerClaim, CustomerTag, Followup, FollowupAttachment, Opportunity, Project, Tag, Task
from app.data_models import Customer, Product, SalesOrder, SalesOrderLine
from app.deps import Actor, DB
from app.models import User, utcnow
from app.constants import OWNERSHIP_PUBLIC_POOL, ROLE_SALES



class CustomerRow(dto.CustomerView):
    contact_name: str | None = None
    last_followup: datetime | None = None
    next_action: str | None = None
    next_due: datetime | None = None
    tags: list[str] = []


class Customers(dto.DTO):
    rows: list[CustomerRow]
    total: int
    # 客户页标签页计数（docs/32 §3.2 级联推导，互斥；at_risk/key 为提醒直达口径，可能不在五标签内）。
    tabs: dict[str, int | None] = {}


class TaskRow(dto.TaskView):
    customer_name: str | None = None
    customer_level: str | None = None
    opp_stage: str | None = None


class Tasks(dto.DTO):
    rows: list[TaskRow]
    total: int
    counts: dict[str, int]


class RecentRow(dto.FollowupView):
    customer_name: str


class Recent(dto.DTO):
    rows: list[RecentRow]
    total: int


class FollowupAction(dto.DTO):
    followup: dto.FollowupInput
    complete_task_id: UUID | None = None


class TrendPoint(dto.DTO):
    date: date
    value: str | None
    last_year: str | None


class TopCustomerRow(dto.DTO):
    id: UUID
    name: str
    amount: str | None
    last_year: str | None
    yoy: str | None


class ProductRow(dto.DTO):
    name: str
    amount: str | None
    yoy: str | None
    customers: int | None


class FunnelStage(dto.DTO):
    stage: str
    current: int | None
    prev: int | None


class RiskCount(dto.DTO):
    kind: str
    count: int


class Performance(dto.DTO):
    through: date | None
    verified: bool
    warnings: list[str]
    month_amount: str | None
    target_amount: str | None
    completion: str | None
    last_year_amount: str | None
    yoy: str | None
    remaining: str | None
    workdays_remaining: int | None
    daily_required: str | None
    risks: list[RiskCount]
    trend: list[TrendPoint]
    key_metrics: dict[str, str | None]
    top_customers: list[TopCustomerRow]
    structure: dict[str, str | int | None]
    # 客户质量四指标（docs/32 §3.5）：新增/活跃/沉睡/复购，避免单个大客户影响判断。
    quality: dict[str, int | None] | None = None
    products: list[ProductRow]
    funnel: list[FunnelStage]


class MonthlyPoint(dto.DTO):
    date: date
    value: str | None


class MonthlyTrend(dto.DTO):
    points: list[MonthlyPoint]
    warnings: list[str]


class OpportunityRecentRow(dto.DTO):
    id: UUID
    customer_id: UUID
    customer_name: str
    opportunity_name: str
    stage: str
    estimated_amount: str | None
    expected_close_date: date | None
    created_at: datetime
    products: list[dto.ProductRef]


class RecentOpportunities(dto.DTO):
    rows: list[OpportunityRecentRow]
    total: int


def monthly_trend(db, actor, source_id, period):
    crm.role(actor, {ROLE_SALES})
    period = bi.month(period)
    bi.source(db, actor, source_id)
    points, warnings = [], []
    # Reuse the authoritative monthly analysis, including verification and returns;
    # unavailable periods remain null, never zero-filled or summed in the browser.
    index = period.year * 12 + period.month - 1
    for n in range(index - 5, index + 1):
        current = date(n // 12, n % 12 + 1, 1)
        analysis = bi.analysis(db, actor, source_id, current, 'customer', 0, 1, 'verified')
        amount = next((m.value for m in analysis.metrics if m.code == 'EXEC_SALES_AMT'), None)
        points.append(MonthlyPoint(date=current, value=amount if analysis.verified else None))
        if not analysis.verified:
            warnings.append(f'{current:%Y-%m} 未满足销售口径核实条件，不显示金额')
    return MonthlyTrend(points=points, warnings=warnings)


def visible(db, actor):
    crm.role(actor, {ROLE_SALES})
    return select(Customer.id).where(Customer.is_active, crm.customer_scope(db, actor, Customer.owner_user_id))


STATUS_KEYS = ('dormant', 'deal', 'quoting', 'intent', 'new', 'at_risk', 'key')


def customer_caliber(db, actor, ids):
    """客户页级联口径（docs/32 §3.2）：按 沉睡>成交>报价中>意向>新客户 互斥判定。

    返回 (cid->bucket 映射, tabs 计数, 附加集合 {at_risk, key})。判定锚点：
    成交=有精斗云销售单；沉睡=距最近成交>dormant_days；报价中=无成交且开放项目
    最高阶段∈{招投标,大单议价}（跟项目走，老板拍板）；意向=无成交且有开放项目；
    新客户=无成交且无开放项目。
    """
    config = bi.settings(db)
    today = bi.utcnow().astimezone(bi.TZ).date()
    last_order: dict = {}
    for cid, last in db.execute(select(SalesOrder.customer_id, func.max(SalesOrder.order_date))
                                .where(SalesOrder.customer_id.in_(ids)).group_by(SalesOrder.customer_id)):
        last_order[cid] = last
    rank = case({'contact': 0, 'recommend': 1, 'selection': 2, 'bidding': 3, 'negotiation': 4, 'delivery': 5},
                value=Opportunity.stage, else_=-1)
    top_stage: dict = {}
    for cid, stage in db.execute(select(Opportunity.customer_id, Opportunity.stage)
                                 .where(Opportunity.customer_id.in_(ids), Opportunity.status == 'open', Opportunity.is_active)
                                 .order_by(Opportunity.customer_id, rank.desc())):
        top_stage.setdefault(cid, stage)
    key_ids, _key_warning = bi.key_customers_all_sources(db, actor)
    lifecycle = dict(db.execute(select(Customer.id, Customer.lifecycle_status).where(Customer.id.in_(ids))).all())
    bucket: dict[str, str] = {}
    counts = {'dormant': 0, 'deal': 0, 'quoting': 0, 'intent': 0, 'new': 0}
    at_risk: set = set()
    quote_stages = {'bidding', 'negotiation'}
    for cid in ids:
        if lifecycle.get(cid) == 'lost':
            # 手动认定的流失客户不入任何标签页，仅“全部”可见（docs/32 §1 拍板 8）。
            bucket[cid] = 'lost'
            continue
        last = last_order.get(cid)
        if last is not None:
            days = (today - last).days
            if days >= config.lost_warning_days:
                at_risk.add(cid)
            if days > config.dormant_days:
                bucket[cid] = 'dormant'
            else:
                bucket[cid] = 'deal'
        elif top_stage.get(cid) in quote_stages:
            bucket[cid] = 'quoting'
        elif cid in top_stage:
            bucket[cid] = 'intent'
        else:
            bucket[cid] = 'new'
        counts[bucket[cid]] += 1
    tabs = {**counts,
            'at_risk': len(at_risk),
            'key': len(key_ids & set(ids)) if key_ids else None}
    return bucket, tabs, at_risk, key_ids


def customers(db: DB, actor: Actor, q: str = '', pool: bool = False,
              offset: int = 0, limit: int = 20, claim: str | None = None,
              level: str | None = None, tag_id=None, status: str | None = None):
    ids = visible(db, actor)
    query = select(Customer).where(Customer.is_active)
    query = query.where(Customer.ownership_status == OWNERSHIP_PUBLIC_POOL) if pool else query.where(Customer.id.in_(ids))
    if pool and claim == 'claimed':
        query = query.where(exists().where(CustomerClaim.customer_id == Customer.id))
    elif pool and claim == 'unclaimed':
        query = query.where(~exists().where(CustomerClaim.customer_id == Customer.id))
    if q:
        # Public pool exposes names/codes/claims only, never another customer's private contact details.
        match = or_(Customer.customer_name.icontains(q, autoescape=True), Customer.customer_code.icontains(q, autoescape=True))
        if not pool:
            match = or_(match, exists().where(Contact.customer_id == Customer.id, Contact.is_active,
                                             or_(Contact.name.icontains(q, autoescape=True),
                                                 Contact.mobile.icontains(q, autoescape=True))))
        query = query.where(match)
    if not pool and level == 'none':
        query = query.where(Customer.customer_level.is_(None))
    elif not pool and level:
        if level not in {'A', 'B', 'C', 'D'}:
            raise HTTPException(422, '客户等级无效')
        query = query.where(Customer.customer_level == level)
    if not pool and tag_id:
        query = query.where(exists().where(CustomerTag.customer_id == Customer.id, CustomerTag.tag_id == tag_id))
    id_list = list(db.scalars(select(Customer.id).where(Customer.id.in_(ids), Customer.is_active)))
    tabs: dict[str, int | None] = {}
    if not pool:
        bucket, tabs, at_risk, key_ids = customer_caliber(db, actor, id_list)
        if status:
            if status not in STATUS_KEYS:
                raise HTTPException(422, '客户状态筛选无效')
            selected = key_ids if status == 'key' else at_risk if status == 'at_risk' else {
                cid for cid in id_list if bucket.get(cid) == status}
            query = query.where(Customer.id.in_(selected or {UUID(int=0)}))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = [CustomerRow.model_validate(c) for c in db.scalars(query.order_by(Customer.customer_name, Customer.id).offset(offset).limit(limit))]
    crm.attach_claims(db, rows)
    if pool:
        for row in rows:
            row.remark = None
        return Customers(rows=rows, total=total)
    page_ids = [r.id for r in rows]
    # Rank within the page in SQL; one bounded query per kind, no per-customer requests.
    def first_rows(model, order, *conditions):
        ranked = select(model.id.label('id'), func.row_number().over(partition_by=model.customer_id, order_by=order).label('rn')).where(model.customer_id.in_(page_ids), *conditions).subquery()
        return {x.customer_id: x for x in db.scalars(select(model).join(ranked, ranked.c.id == model.id).where(ranked.c.rn == 1))}
    contacts = first_rows(Contact, [Contact.is_primary.desc(), Contact.created_at, Contact.id], Contact.is_active)
    follows = first_rows(Followup, [Followup.occurred_at.desc(), Followup.id], Followup.is_active)
    tasks = first_rows(Task, [Task.due_at, Task.id], Task.status == 'todo', Task.assignee_user_id == actor.id)
    tag_rows = db.execute(select(CustomerTag.customer_id, Tag.tag_name).join(Tag, Tag.id == CustomerTag.tag_id)
                          .where(CustomerTag.customer_id.in_(page_ids), Tag.is_active)
                          .order_by(CustomerTag.created_at, Tag.tag_name)).all()
    tags: dict = {}
    for cid, name in tag_rows:
        tags.setdefault(cid, []).append(name)
    for row in rows:
        c, f, t = contacts.get(row.id), follows.get(row.id), tasks.get(row.id)
        row.contact_name = c.name if c else None
        row.last_followup = f.occurred_at if f else None
        row.next_action, row.next_due = (t.title, t.due_at) if t else (None, None)
        row.tags = tags.get(row.id, [])
    return Customers(rows=rows, total=total, tabs=tabs)


def tasks(db: DB, actor: Actor, view: Literal['today', 'overdue', 'week', 'future', 'done'] = 'today',
          offset: int = 0, limit: int = 20):
    ids = visible(db, actor)
    now = utcnow().astimezone(crm.TZ)
    start = datetime.combine(now.date(), time.min, crm.TZ)
    end = start + timedelta(days=1)
    base = select(Task).where(Task.assignee_user_id == actor.id, or_(Task.customer_id.is_(None), Task.customer_id.in_(ids)))
    conditions = {
        'today': (Task.status == 'todo', Task.due_at >= start, Task.due_at < end),
        'overdue': (Task.status == 'todo', Task.due_at < now),
        'week': (Task.status == 'todo', Task.due_at >= end, Task.due_at < end + timedelta(days=7)),
        'future': (Task.status == 'todo', Task.due_at >= end),
        'done': (Task.status == 'done',),
    }
    counts = {key: db.scalar(select(func.count()).select_from(base.where(*condition).subquery())) for key, condition in conditions.items()}
    counts['done_today'] = db.scalar(select(func.count()).select_from(
        base.where(Task.status == 'done', Task.completed_at >= start, Task.completed_at < end).subquery()))
    order = [Task.completed_at.desc(), Task.id] if view == 'done' else [Task.due_at, Task.id]
    rows = list(db.scalars(base.where(*conditions[view]).order_by(*order).offset(offset).limit(limit)))
    page_customers = [t.customer_id for t in rows if t.customer_id]
    info = {cid: (name, level) for cid, name, level in db.execute(select(Customer.id, Customer.customer_name, Customer.customer_level)
                           .where(Customer.id.in_(page_customers))).all()}
    # 今日作战区的“当前阶段”：该客户开放项目的最高阶段（docs/32 §3.1 项目阶段是推进的唯一口径）。
    stage_rank = case({'contact': 0, 'recommend': 1, 'selection': 2, 'bidding': 3, 'negotiation': 4, 'delivery': 5},
                      value=Opportunity.stage, else_=-1)
    opp_stage = {cid: stage for cid, stage in db.execute(
        select(Opportunity.customer_id, Opportunity.stage).where(
            Opportunity.customer_id.in_(page_customers), Opportunity.status == 'open', Opportunity.is_active)
        .order_by(Opportunity.customer_id, stage_rank.desc())).all()}
    return Tasks(rows=[TaskRow(**dto.TaskView.model_validate(t).model_dump(),
                               customer_name=info.get(t.customer_id, (None, None))[0],
                               customer_level=info.get(t.customer_id, (None, None))[1],
                               opp_stage=opp_stage.get(t.customer_id)) for t in rows],
                 total=counts[view], counts=counts)


def recent(db: DB, actor: Actor, offset: int = 0, limit: int = 5):
    ids = visible(db, actor)
    query = select(Followup, Customer.customer_name).join(Customer, Customer.id == Followup.customer_id).where(
        Followup.customer_id.in_(ids), Followup.owner_user_id == actor.id, Followup.is_active)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.execute(query.order_by(Followup.occurred_at.desc(), Followup.id).offset(offset).limit(limit)).all()
    views = [RecentRow(**dto.FollowupView.model_validate(f).model_dump(), customer_name=name) for f, name in rows]
    crm.attach_followup_images(db, views)
    return Recent(rows=views, total=total)


def followup(cid: UUID, payload: FollowupAction, db: DB, actor: Actor):
    crm.role(actor, {ROLE_SALES})
    crm.customer(db, actor, cid, True)
    task = None
    if payload.complete_task_id:
        task = db.scalar(select(Task).where(Task.id == payload.complete_task_id).with_for_update().execution_options(populate_existing=True))
        if not task or task.customer_id != cid or task.assignee_user_id != actor.id:
            raise HTTPException(404, '待办不存在或无权访问')
        if task.status != 'todo':
            raise HTTPException(409, '待办已结束，请刷新后查看；本次未重复保存跟进')
    # 「已沟通/沟通顺利」却不安排下一步等于流程断链；这些结果本身就是"暂不安排"的原因。
    if not payload.followup.next_followup_at and payload.followup.contact_result in {'normal', 'good'}:
        raise HTTPException(422, '已沟通或沟通顺利的客户请安排下一步；若暂不跟进，请把沟通结果改为“暂无需求 / 等待反馈 / 未接通”等')
    result = crm.save_followup(db, actor, cid, payload.followup, commit=False, next_owner=actor.id)
    if task:
        before = crm.snapshot(task)
        task.status, task.completed_at = 'done', utcnow()
        task.completion_result = '已记录跟进'
        crm.event(db, actor, 'task_complete', cid, task.id, before, crm.snapshot(task))
    db.commit()
    return result



def performance(db: DB, actor: Actor, source_id: UUID, from_month: date, to_month: date, months: int = 6):
    """Personal business cockpit. Salesperson identity comes from the login actor, never from query params."""
    crm.role(actor, {ROLE_SALES})
    uid = actor.id
    today = bi.utcnow().astimezone(bi.TZ).date()
    current = bi.month_start(today)
    to_month = min(bi.month(to_month), current)
    from_month = bi.month(from_month)
    if from_month > to_month:
        raise HTTPException(422, '时间范围无效')
    from_start, to_end = bi.month_start(from_month), bi.month_end(to_month)
    ly_start, ly_end = bi.shift_month(from_month, -12), bi.month_end(bi.shift_month(to_month, -12))
    warnings: list[str] = []
    sources = list(db.scalars(select(bi.DataSource).where(bi.DataSource.is_enabled,
        bi.DataSource.source_code.in_(select(bi.SalesOrder.source_system).distinct()))))
    monthly: dict = defaultdict(Decimal)
    cur_cust: dict = defaultdict(Decimal)
    ly_cust: dict = defaultdict(Decimal)
    first_order: dict = {}
    deal: set = set()
    sales_ready = bool(sources)
    covered_ly = bool(sources)
    pairs: list = []
    for src_i in sources:
        rows = bi.load_orders(db, actor, src_i, uid)
        if not rows:
            continue
        review = db.get(bi.SalesReview, src_i.id)
        cfg = bi.dto.ReviewInput.model_validate(review.value) if review else None
        earliest = min(r.order_date for r in rows)
        ready_i, cfg, reason_i = bi.review_ready(db, src_i, earliest, today, rows, True)
        pairs.append((src_i, cfg))
        sales_ready &= ready_i
        if not ready_i and reason_i:
            warnings.append(f'数据源「{src_i.source_name}」{reason_i}')
        for o in rows:
            v = bi.order_value(o, cfg, True)
            monthly[bi.month_start(o.order_date)] += v
            if from_start <= o.order_date <= to_end:
                cur_cust[o.customer_id] += v
                deal.add(o.customer_id)
            if ly_start <= o.order_date <= ly_end:
                ly_cust[o.customer_id] += v
            if o.customer_id not in first_order or o.order_date < first_order[o.customer_id]:
                first_order[o.customer_id] = o.order_date
        if (cfg.coverage_from and cfg.coverage_from > ly_start) or not cfg.full_history:
            covered_ly = False
    actual = sum(cur_cust.values(), Decimal(0)) if sales_ready else None
    ly_actual = sum(ly_cust.values(), Decimal(0)) if sales_ready and covered_ly else None
    target_total, any_target = Decimal(0), False
    m = from_month
    while m <= to_month:
        t = bi.get_target(db, actor, uid, m)
        if t.amount:
            target_total += Decimal(t.amount)
            any_target = True
        m = bi.shift_month(m, 1)
    completion = bi.ratio(actual, target_total) * 100 if actual is not None and any_target and target_total else None
    yoy = (actual - ly_actual) / ly_actual * 100 if actual is not None and ly_actual not in (None, Decimal(0)) and ly_actual else None
    if to_month == current:
        days = bi.work_dates(to_month, uid, bi.settings(db))
        workdays_remaining = sum(1 for d in days if d > today)
        remaining = max(target_total - actual, Decimal(0)) if actual is not None and any_target else None
        daily_required = bi.ratio(remaining, workdays_remaining) if remaining is not None and workdays_remaining else None
    else:
        workdays_remaining = remaining = daily_required = None
    attention = bi.attention(db, actor, source_id)
    risk_total: dict = defaultdict(int)
    for kind, n in attention.counts.items():
        risk_total[kind] += n
    trend = []
    for i in range(months):
        ms = bi.shift_month(to_month, -(months - 1 - i))
        lys = bi.shift_month(ms, -12)
        trend.append(TrendPoint(date=ms,
            value=bi.money(monthly[ms]) if sales_ready and ms <= current and monthly[ms] else None,
            last_year=bi.money(monthly[lys]) if sales_ready and covered_ly and lys <= current and monthly[lys] else None))
    def funnel_counts(win_start: datetime, win_end: datetime, new_created: bool = False):
        base = [Followup.owner_user_id == uid, Followup.is_active, Followup.occurred_at >= win_start, Followup.occurred_at <= win_end]
        if new_created:
            # 新增客户=建档口径（docs/32 §3.5：CRM_NEW_CUSTOMERS），取权限范围内 created_at 落在窗口的客户。
            return (db.scalar(select(func.count()).select_from(
                select(Customer.id).where(Customer.id.in_(visible(db, actor)),
                                          Customer.created_at >= win_start, Customer.created_at <= win_end).subquery())), None, None, None)
        return (db.scalar(select(func.count(func.distinct(Followup.customer_id))).where(*base)),
                db.scalar(select(func.count(func.distinct(Followup.customer_id))).where(*base, Followup.is_effective.is_(True))),
                db.scalar(select(func.count(func.distinct(Followup.customer_id))).where(*base, Followup.quotation_sent.is_(True))),
                None)
    created, _, _, _ = funnel_counts(datetime.combine(from_month, time.min, bi.TZ), datetime.combine(to_end, time.max, bi.TZ), new_created=True)
    p_created, _, _, _ = funnel_counts(datetime.combine(bi.shift_month(from_month, -1), time.min, bi.TZ),
                                       datetime.combine(bi.month_end(bi.shift_month(to_month, -1)), time.max, bi.TZ), new_created=True)
    followed, effective, quoted, _ = funnel_counts(
        datetime.combine(from_month, time.min, bi.TZ), datetime.combine(to_end, time.max, bi.TZ))
    p_followed, _p_eff, p_quoted, _ = funnel_counts(
        datetime.combine(bi.shift_month(from_month, -1), time.min, bi.TZ),
        datetime.combine(bi.month_end(bi.shift_month(to_month, -1)), time.max, bi.TZ))
    deal_n = len(deal) if sales_ready else None
    new_customers = sum(1 for c in cur_cust if first_order.get(c, from_start) >= from_start) if sales_ready else None
    repeat = sum(1 for c in deal if first_order.get(c, from_start) < from_start) if sales_ready else None
    top = sorted(cur_cust.items(), key=lambda kv: -kv[1])[:5]
    names = dict(db.execute(select(Customer.id, Customer.customer_name).where(Customer.id.in_([cid for cid, _ in top]))).all())
    top_rows = [TopCustomerRow(id=cid, name=names.get(cid, '客户'), amount=bi.money(v),
                               last_year=bi.money(ly_cust[cid]) if covered_ly and ly_cust.get(cid) else None,
                               yoy=str(((v - ly_cust[cid]) / ly_cust[cid] * 100).quantize(Decimal('0.1')))
                                   if covered_ly and ly_cust.get(cid) not in (None, Decimal(0)) and v is not None else None)
                for cid, v in top]
    total_amt = sum(cur_cust.values(), Decimal(0))
    old_amt = sum((v for cid, v in cur_cust.items() if first_order.get(cid, from_start) < from_start), Decimal(0))
    top5_amt = sum((v for _, v in top), Decimal(0))
    structure = {
        'old_ratio': str((old_amt / total_amt * 100).quantize(Decimal('0.1'))) if total_amt else None,
        'new_ratio': str(((total_amt - old_amt) / total_amt * 100).quantize(Decimal('0.1'))) if total_amt else None,
        'new_customers': new_customers,
        'new_deals': sum(1 for c in deal if first_order.get(c, from_start) >= from_start) if sales_ready else None,
        'repeat_customers': repeat,
        'top5_share': str((top5_amt / total_amt * 100).quantize(Decimal('0.1'))) if total_amt else None,
    }
    def prod_stats(a: date, b: date):
        out: dict = defaultdict(lambda: [Decimal(0), set()])
        for src_i, cfg in pairs:
            amt = func.sum(case((SalesOrder.source_status.in_(cfg.excluded_statuses), 0),
                                (SalesOrder.source_status.in_(cfg.return_statuses), -func.abs(SalesOrderLine.line_amount)),
                                else_=SalesOrderLine.line_amount))
            for pid, name, v, n in db.execute(select(SalesOrderLine.product_id, Product.product_name, amt,
                    func.count(func.distinct(SalesOrder.customer_id)))
                    .join(SalesOrder, SalesOrder.id == SalesOrderLine.sales_order_id)
                    .join(Product, Product.id == SalesOrderLine.product_id)
                    .where(SalesOrder.source_system == src_i.source_code, SalesOrder.sales_user_id == uid,
                           SalesOrderLine.is_active, SalesOrderLine.version == SalesOrder.version,
                           SalesOrder.order_date >= a, SalesOrder.order_date <= b)
                    .group_by(SalesOrderLine.product_id, Product.product_name)):
                acc = out[(pid, name)]
                acc[0] += (v or Decimal(0))
                acc[1].add(n)
        return out
    prod_cur = prod_stats(from_start, to_end) if sales_ready else {}
    prod_ly = prod_stats(ly_start, ly_end) if sales_ready and covered_ly else {}
    products = sorted(prod_cur.items(), key=lambda kv: -kv[1][0])[:5]
    product_rows = [ProductRow(name=name, amount=bi.money(v[0]),
                               yoy=str(((v[0] - prod_ly[key][0]) / prod_ly[key][0] * 100).quantize(Decimal('0.1')))
                                   if key in prod_ly and prod_ly[key][0] else None,
                               customers=len(v[1]) if v[1] else None)
                    for key, vals in products for name, v in [(key[1], vals)]]
    return Performance(through=min(today, to_end), verified=sales_ready, warnings=warnings,
        month_amount=bi.money(actual) if actual is not None else None,
        target_amount=bi.money(target_total) if any_target else None,
        completion=str(completion.quantize(Decimal('0.1'))) if completion is not None else None,
        last_year_amount=bi.money(ly_actual) if ly_actual is not None else None,
        yoy=str(yoy.quantize(Decimal('0.1'))) if yoy is not None else None,
        remaining=bi.money(remaining) if remaining is not None else None,
        workdays_remaining=workdays_remaining,
        daily_required=bi.money(daily_required) if daily_required is not None else None,
        risks=[RiskCount(kind=k, count=n) for k, n in sorted(risk_total.items(), key=lambda kv: -kv[1])],
        trend=trend,
        key_metrics={'deal_customers': str(deal_n) if deal_n is not None else None,
                     'new_customers': str(new_customers) if new_customers is not None else None,
                     'followup_customers': str(followed) if followed is not None else None,
                     'effective': str(effective) if effective is not None else None,
                     'quoted_customers': str(quoted) if quoted is not None else None,
                     'repeat_customers': str(repeat) if repeat is not None else None},
        top_customers=top_rows,
        structure=structure,
        quality={'new': created, 'active': deal_n,
                 'dormant': risk_total.get('沉睡') or 0 if sales_ready else None,
                 'repeat': repeat},
        products=product_rows,
        funnel=[FunnelStage(stage=s, current=c, prev=p) for s, c, p in
                [('新增客户', created, p_created), ('有效沟通', effective, p_followed if p_followed else None), ('报价', quoted, p_quoted), ('成交', deal_n, None)]])


def recent_opportunities(db: DB, actor: Actor, days: int = 30, limit: int = 10):
    """工作台首页：最近创建的开放项目及其推荐产品。身份取自登录态。"""
    crm.role(actor, {ROLE_SALES})
    since = bi.utcnow() - timedelta(days=days)
    query = select(Opportunity, Customer.customer_name).join(Customer, Customer.id == Opportunity.customer_id).where(
        Opportunity.owner_user_id == actor.id, Opportunity.status == 'open', Opportunity.is_active,
        Opportunity.created_at >= since)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.execute(query.order_by(Opportunity.created_at.desc(), Opportunity.id).limit(limit)).all()
    views = [dto.OpportunityView.model_validate(o) for o, _ in rows]
    crm.attach_products(db, views)
    out = [OpportunityRecentRow(id=v.id, customer_id=v.customer_id, customer_name=name,
                                opportunity_name=v.opportunity_name, stage=v.stage,
                                estimated_amount=bi.money(v.estimated_amount) if v.estimated_amount is not None else None,
                                expected_close_date=v.expected_close_date,
                                created_at=o.created_at, products=v.products)
           for v, (o, name) in zip(views, rows)]
    return RecentOpportunities(rows=out, total=total)


class ProjectBoardRow(dto.DTO):
    id: UUID
    customer_id: UUID
    customer_name: str
    opportunity_name: str
    project_name: str | None
    owner_user_id: UUID
    owner_name: str
    stage: str
    probability: str | None
    estimated_amount: str | None
    expected_close_date: date | None
    next_promotion: str | None
    products: list[dto.ProductRef]


class ProjectBoard(dto.DTO):
    rows: list[ProjectBoardRow]
    total: int


def project_board(db: DB, actor: Actor, offset: int = 0, limit: int = 20):
    """全员开放项目看板（docs/32 阶段②，老板拍板：销售端可见所有同事的项目）。

    只读放行：所有销售可见全部同事的开放项目（含负责人姓名/产品提报）；
    写入仍受 crm_service 归属校验约束，他人项目不可改（越权测试覆盖）。
    """
    crm.role(actor, {ROLE_SALES})
    base = select(Opportunity).where(Opportunity.status == 'open', Opportunity.is_active)
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    rows = db.execute(
        select(Opportunity, Customer.customer_name, User.display_name)
        .join(Customer, Customer.id == Opportunity.customer_id)
        .join(User, User.id == Opportunity.owner_user_id)
        .where(Opportunity.status == 'open', Opportunity.is_active)
        .order_by(Opportunity.expected_close_date.asc().nulls_last(), Opportunity.created_at.desc(), Opportunity.id)
        .offset(offset).limit(limit)).all()
    views = [dto.OpportunityView.model_validate(o) for o, _, _ in rows]
    crm.attach_products(db, views)
    out = []
    for v, (o, customer_name, owner_name) in zip(views, rows):
        project_name = None
        if o.project_id:
            project_name = db.scalar(select(Project.project_name).where(Project.id == o.project_id))
        out.append(ProjectBoardRow(
            id=v.id, customer_id=v.customer_id, customer_name=customer_name,
            opportunity_name=v.opportunity_name, project_name=project_name,
            owner_user_id=v.owner_user_id, owner_name=owner_name,
            stage=v.stage,
            probability=str((Decimal(v.probability) * 100).quantize(Decimal('0.1'))) if v.probability is not None else None,
            estimated_amount=bi.money(v.estimated_amount) if v.estimated_amount is not None else None,
            expected_close_date=v.expected_close_date,
            next_promotion=o.next_promotion, products=v.products))
    return ProjectBoard(rows=out, total=total)


class WorkbenchSummary(dto.DTO):
    month: date
    target_amount: str | None
    actual_amount: str | None
    completion: str | None
    verified: bool
    today_tasks: int
    overdue_tasks: int
    open_projects: int
    key_customers: int | None
    warnings: list[str]


def workbench_summary(db: DB, actor: Actor, source_id: UUID):
    """工作台顶部 4 指标卡（docs/32 阶段②）：本月目标/今日待办/待跟进项目/重点客户。"""
    crm.role(actor, {ROLE_SALES})
    today = bi.utcnow().astimezone(bi.TZ).date()
    current = bi.month_start(today)
    warnings: list[str] = []
    analysis = bi.analysis(db, actor, source_id, current, 'customer', 0, 1, 'verified')
    actual = next((m.value for m in analysis.metrics if m.code == 'EXEC_SALES_AMT'), None)
    verified = analysis.verified
    if not verified:
        warnings.append('销售口径未核实，本月完成金额暂不显示')
    target_row = bi.get_target(db, actor, actor.id, current)
    target = target_row.amount
    completion = str((Decimal(actual) / Decimal(target) * 100).quantize(Decimal('0.1'))) \
        if actual is not None and target else None
    ids = visible(db, actor)
    now = utcnow()
    task_base = select(Task).where(Task.assignee_user_id == actor.id,
                                   or_(Task.customer_id.is_(None), Task.customer_id.in_(ids)))
    today_tasks = db.scalar(select(func.count()).select_from(task_base.where(
        Task.status == 'todo', Task.due_at >= datetime.combine(today, time.min, bi.TZ),
        Task.due_at < datetime.combine(today + timedelta(days=1), time.min, bi.TZ)).subquery()))
    overdue_tasks = db.scalar(select(func.count()).select_from(task_base.where(
        Task.status == 'todo', Task.due_at < now).subquery()))
    open_projects = db.scalar(select(func.count()).select_from(
        select(Opportunity.id).where(Opportunity.status == 'open', Opportunity.is_active).subquery()))
    key_ids, key_warning = bi.rfm_key_customers(db, actor, source_id)
    if key_warning:
        warnings.append(key_warning)
    return WorkbenchSummary(
        month=current, target_amount=str(target) if target else None,
        actual_amount=actual if verified else None, completion=completion, verified=verified,
        today_tasks=today_tasks or 0, overdue_tasks=overdue_tasks or 0,
        open_projects=open_projects or 0,
        key_customers=len(key_ids) if not key_warning else None,
        warnings=warnings)


class AttachmentSaved(dto.DTO):
    id: UUID
    filename: str
    content_type: str
    size_bytes: int
    created_at: datetime


_IMAGE_EXT = {'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp'}


def _own_followup(db, actor, fid):
    follow = db.get(Followup, fid)
    if not follow or not follow.is_active or follow.owner_user_id != actor.id:
        raise HTTPException(404, '跟进不存在或无权访问')
    return follow


def add_followup_attachment(fid: UUID, payload: dto.FollowupAttachmentInput, db: DB, actor: Actor):
    """跟进图片粘贴上传（base64）。仅本人跟进；类型/大小受 CRM 设置上限约束（铁律 9）。"""
    crm.role(actor, {ROLE_SALES})
    _own_followup(db, actor, fid)
    try:
        data = base64.b64decode(payload.data_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, '图片数据不是有效的 base64')
    if not data:
        raise HTTPException(422, '图片内容为空')
    limit_mb = crm.settings(db).followup_image_max_mb
    if len(data) > limit_mb * 1024 * 1024:
        raise HTTPException(413, f'图片超过单张上限 {limit_mb}MB（CRM 设置可调）')
    digest = hashlib.sha256(data).hexdigest()
    root = Path(get_settings().upload_root).resolve() / 'followups' / str(fid)
    root.mkdir(parents=True, exist_ok=True)
    target = root / f'{digest}{_IMAGE_EXT[payload.content_type]}'
    if not target.exists():
        target.write_bytes(data)
    row = FollowupAttachment(followup_id=fid, filename=payload.filename, content_type=payload.content_type,
                             size_bytes=len(data), sha256=digest, storage_path=str(target), created_by=actor.id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return AttachmentSaved(id=row.id, filename=row.filename, content_type=row.content_type,
                           size_bytes=row.size_bytes, created_at=row.created_at)


def followup_attachments(db: DB, actor: Actor, fid: UUID):
    crm.role(actor, {ROLE_SALES})
    follow = db.get(Followup, fid)
    if not follow or not follow.is_active:
        raise HTTPException(404, '跟进不存在或无权访问')
    if actor.id != follow.owner_user_id:
        crm.customer(db, actor, follow.customer_id, False)
    rows = db.scalars(select(FollowupAttachment).where(FollowupAttachment.followup_id == fid,
                                                       FollowupAttachment.is_active).order_by(FollowupAttachment.created_at))
    return [AttachmentSaved(id=r.id, filename=r.filename, content_type=r.content_type,
                            size_bytes=r.size_bytes, created_at=r.created_at) for r in rows]


def attachment_image(aid: UUID, db: DB, actor: Actor) -> tuple[FollowupAttachment, bytes]:
    row = db.get(FollowupAttachment, aid)
    if not row or not row.is_active:
        raise HTTPException(404, '附件不存在或无权访问')
    follow = db.get(Followup, row.followup_id)
    allowed = follow and actor.id in {row.created_by, follow.owner_user_id}
    if not allowed:
        # 其他角色/非本人：按客户可见性走既有权限（老板全量、销售按认养范围）。
        crm.customer(db, actor, follow.customer_id, False)
    path = Path(row.storage_path)
    if not path.exists():
        raise HTTPException(404, '附件文件已丢失')
    return row, path.read_bytes()
