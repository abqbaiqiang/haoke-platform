"""Scoped CORE/CRM analysis; unverified source reconciliation stays explicitly separate."""
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from math import ceil
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert

from app import bi_schemas as dto, services
from app.bi_calculations import ZERO, metric, money, month_end, month_start, ratio, shift_month, target_metrics, work_dates
from app.bi_models import BISetting, SalesReview, SalesTarget
from app.crm_models import CustomerClaim, Followup, Opportunity, Task
from app.data_models import Customer, DataSource, FinancialMetric, FinancialPeriod, Product, SalesOrder, SalesOrderLine
from app.models import ActivityLog, User, utcnow
from app.permissions import can_read_owned
from app.constants import FULL_ACCESS_ROLES, ROLE_ADMIN, ROLE_FINANCE, ROLE_MANAGER, ROLE_OWNER, ROLE_SALES, \
    SALES_ACTOR_ROLES, TARGET_MONTHLY, TARGET_QUARTERLY

TZ = ZoneInfo('Asia/Shanghai')


def require(actor, roles):
    if actor.role_code == ROLE_ADMIN:
        return  # 管理员拥有最高权限（2026-09-16 决策），等同 owner 查看全部业务数据
    if actor.role_code not in roles:
        raise HTTPException(403, '无此分析或配置权限')


def scope(db, actor, column):
    require(actor, {ROLE_OWNER, ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES, ROLE_FINANCE})
    p = services.principal_for(db, actor)
    if p.role in FULL_ACCESS_ROLES:
        return True
    ids = {p.user_id} if p.role in SALES_ACTOR_ROLES else set()
    if (p.role == 'manager' and p.scope_type == 'team') or (p.role == 'finance' and p.scope_type == 'custom'):
        ids |= {UUID(i) for i in p.member_ids}
    return column.in_(ids)


def month(value: date):
    if value.day != 1 or not 2000 <= value.year <= 2100:
        raise HTTPException(422, '月份请使用 2000–2100 年的每月第一天')
    return value


def settings(db):
    obj = db.get(BISetting, 1)
    return dto.Settings.model_validate(obj.value if obj else {})


def audit(db, actor, action, obj, before, after):
    db.add(ActivityLog(user_id=actor.id, activity_type=action, object_type='bi_config', object_id=obj,
                       details=jsonable_encoder({'before': before, 'after': after})))


def save_settings(db, actor, payload):
    require(actor, FULL_ACCESS_ROLES)
    for uid in payload.personal_calendar:
        if not db.get(User, uid):
            raise HTTPException(422, '人员日历包含无效账号')
    old = settings(db).model_dump(mode='json')
    value = payload.model_dump(mode='json')
    db.execute(insert(BISetting).values(id=1, value=value).on_conflict_do_update(index_elements=['id'], set_={'value': value}))
    audit(db, actor, 'bi_settings_update', None, old, value)
    db.commit()
    return payload


def people(db, actor, config=False):
    if config and actor.role_code in FULL_ACCESS_ROLES:
        condition = True
    else:
        require(actor, {ROLE_OWNER, ROLE_MANAGER, ROLE_SALES})
        condition = scope(db, actor, User.id)
    return [dto.Person(id=u.id, name=u.display_name) for u in db.scalars(select(User).where(
        User.is_active, User.role_code.in_(['sales', 'manager']), condition).order_by(User.display_name, User.id))]


def person(db, actor, uid, admin_read=False):
    if not (admin_read and actor.role_code in FULL_ACCESS_ROLES):
        require(actor, {ROLE_OWNER, ROLE_MANAGER, ROLE_SALES})
        if not can_read_owned(services.principal_for(db, actor), uid):
            raise HTTPException(404, '人员不存在或无权访问')
    target = db.get(User, uid)
    if not target or not target.is_active or target.role_code not in SALES_ACTOR_ROLES:
        raise HTTPException(404, '人员不存在或无权访问')
    return target


def get_target(db, actor, uid, period, target_type=TARGET_MONTHLY):
    person(db, actor, uid, admin_read=True)
    obj = db.scalar(select(SalesTarget).where(SalesTarget.user_id == uid, SalesTarget.period_month == month(period),
                                              SalesTarget.target_type == target_type))
    return dto.TargetView(user_id=uid, month=period, amount=money(obj.sales_amount_target) if obj else None,
                          remark=obj.remark if obj else None, target_type=target_type)


def save_target(db, actor, uid, period, payload, target_type=TARGET_MONTHLY):
    # 目标由管理者（老板/经理）统一在后台设置，销售端只读。
    require(actor, {ROLE_OWNER, ROLE_MANAGER})
    target = person(db, actor, uid)
    period = month(period)
    if target_type == TARGET_QUARTERLY and period.month not in (1, 4, 7, 10):
        raise HTTPException(422, '季度目标必须设置在季度首月（1/4/7/10 月）')
    # Serialize absent-row upserts and their audit snapshots with a stable existing row lock.
    db.execute(select(User.id).where(User.id == target.id).with_for_update())
    obj = db.scalar(select(SalesTarget).where(SalesTarget.user_id == uid, SalesTarget.period_month == period,
                                              SalesTarget.target_type == target_type))
    before = {'amount': money(obj.sales_amount_target), 'remark': obj.remark} if obj else None
    if obj is None:
        obj = SalesTarget(user_id=uid, period_month=period, target_type=target_type, created_by=actor.id)
        db.add(obj)
    obj.sales_amount_target, obj.remark = payload.amount, payload.remark
    db.flush()
    audit(db, actor, 'sales_target_update', obj.id, before,
          {'type': target_type, 'amount': money(payload.amount), 'remark': payload.remark})
    db.commit()
    return get_target(db, actor, uid, period, target_type)


def sources(db, actor):
    require(actor, {ROLE_OWNER, ROLE_MANAGER, ROLE_SALES, ROLE_FINANCE, ROLE_ADMIN})
    query = select(DataSource).where(DataSource.is_enabled)
    if actor.role_code not in FULL_ACCESS_ROLES:
        visible = select(SalesOrder.source_system).where(scope(db, actor, SalesOrder.sales_user_id)).distinct()
        query = query.where(DataSource.source_code.in_(visible))
    rows = db.scalars(query.order_by(DataSource.source_name)).all()
    # Dashboards open on the source with actual loaded volume; empty test sources sink to the bottom.
    totals = dict(db.execute(select(SalesOrder.source_system, func.coalesce(func.sum(SalesOrder.sales_amount), 0))
                             .group_by(SalesOrder.source_system)).all())
    rows = sorted(rows, key=lambda s: (totals.get(s.source_code, ZERO) if s.source_code in totals else ZERO), reverse=True)
    return [dto.SourceView(id=s.id, name=s.source_name) for s in rows]


def source(db, actor, sid, config=False):
    if config:
        require(actor, FULL_ACCESS_ROLES)  # owner now manages source reviews directly (V1 usage decision)
    else:
        require(actor, {ROLE_OWNER, ROLE_MANAGER, ROLE_SALES, ROLE_FINANCE})
    obj = db.get(DataSource, sid)
    if not obj or not obj.is_enabled:
        raise HTTPException(404, '数据源不存在或无权访问')
    if not config and actor.role_code != ROLE_OWNER:
        allowed = db.scalar(select(SalesOrder.id).where(SalesOrder.source_system == obj.source_code,
                            scope(db, actor, SalesOrder.sales_user_id)).limit(1))
        if not allowed:
            raise HTTPException(404, '数据源不存在或无权访问')
    return obj


def latest_fact(db, src):
    return db.scalar(select(func.max(SalesOrder.updated_at)).where(SalesOrder.source_system == src.source_code))


def save_review(db, actor, sid, payload):
    require(actor, FULL_ACCESS_ROLES)
    src = source(db, actor, sid, True)
    # The importer locks this same source before changing facts. Serialize the attestation with it.
    db.execute(select(DataSource.id).where(DataSource.id == sid).with_for_update())
    if payload.coverage_to > utcnow().astimezone(TZ).date():
        raise HTTPException(422, '不能确认未来日期的完整销售覆盖')
    if payload.staff_mapping_complete and db.scalar(select(SalesOrder.id).where(
            SalesOrder.source_system == src.source_code, SalesOrder.sales_user_id.is_(None)).limit(1)):
        raise HTTPException(409, '仍有未映射销售人员，不能确认人员映射完整')
    # Reviews attest an explicitly chosen source export, without rewriting source statuses or amounts.
    facts_updated_at = latest_fact(db, src)
    obj = db.get(SalesReview, sid)
    old = obj.value if obj else None
    if obj is None:
        obj = SalesReview(source_id=sid)
        db.add(obj)
    obj.value = payload.model_dump(mode='json')
    obj.facts_updated_at, obj.reviewed_by, obj.reviewed_at = facts_updated_at, actor.id, utcnow()
    audit(db, actor, 'sales_scope_review', sid, old, obj.value)
    db.commit()
    return payload


def review_ready(db, src, start, end, rows, personal=False):
    review = db.get(SalesReview, src.id)
    if review is None:
        # Owner decision (2026-09-15): an import implies acceptance — no manual attestation
        # gate. Statuses actually present in the data count as valid; excluded/return list
        # defaults still apply. A saved review, once present, governs instead.
        present = {r.source_status for r in rows} or {'unverified'}
        cfg = dto.ReviewInput(coverage_from=min((r.order_date for r in rows), default=start),
            coverage_to=max((r.order_date for r in rows), default=end),
            valid_statuses=sorted(present - {'void', 'cancelled', 'return'}) or ['unverified'],
            staff_mapping_complete=True, full_history=True,
            reason='导入即认可：未保存人工核实，默认全部单据按有效销售计入', acknowledge_export_scope=True)
        return True, cfg, None
    cfg = dto.ReviewInput.model_validate(review.value)
    if review.facts_updated_at != latest_fact(db, src):
        return False, cfg, '销售事实已更新，需重新核对数据覆盖'
    if start < cfg.coverage_from or end > cfg.coverage_to:
        return False, cfg, '统计期间没有完整覆盖确认'
    if personal and not cfg.staff_mapping_complete:
        return False, cfg, '销售人员映射完整性待确认'
    statuses = set(cfg.valid_statuses + cfg.return_statuses + cfg.excluded_statuses)
    if any(r.source_status not in statuses for r in rows if start <= r.order_date <= end):
        return False, cfg, '存在未映射的销售单据状态'
    return True, cfg, None


def load_orders(db, actor, src, uid=None):
    query = select(SalesOrder).where(SalesOrder.source_system == src.source_code,
                                    scope(db, actor, SalesOrder.sales_user_id))
    if uid:
        query = query.where(SalesOrder.sales_user_id == uid)
    return list(db.scalars(query.order_by(SalesOrder.order_date, SalesOrder.id)))


def order_value(order, cfg, verified):
    if not verified:
        return order.sales_amount
    if order.source_status in cfg.excluded_statuses:
        return ZERO
    if order.source_status in cfg.return_statuses:
        return -abs(order.sales_amount)
    return order.sales_amount


def included(order, cfg, verified):
    return not verified or order.source_status not in cfg.excluded_statuses


def normal_sale(order, cfg, verified):
    return not verified or order.source_status in cfg.valid_statuses


def analysis(db, actor, sid, period, dimension='customer', offset=0, limit=20, basis='source'):
    month(period)
    src = source(db, actor, sid)
    today = utcnow().astimezone(TZ).date()
    if period > month_start(today):
        raise HTTPException(422, '销售分析不能查询未来月份')
    through = min(today, month_end(period))
    previous, year_ago = shift_month(period, -1), shift_month(period, -12)
    rows = load_orders(db, actor, src)
    ready, cfg, why = review_ready(db, src, period, through, rows, actor.role_code != ROLE_OWNER)
    prior_ready, _, prior_why = review_ready(db, src, previous, month_end(previous), rows, actor.role_code != ROLE_OWNER)
    year_ready, _, _ = review_ready(db, src, year_ago, month_end(year_ago), rows, actor.role_code != ROLE_OWNER)
    verified = basis == 'verified'
    warnings = []
    if not ready:
        warnings.append(why)
    if period == month_start(today):
        warnings.append(f'本月截至 {through}；环比基期为上月完整月，非同期进度比较')
    if not verified:
        warnings.append('源销售核对：包含未核实状态，退货/作废未调整，不作为已确认经营业绩')
    if verified and not ready:
        return dto.Analysis(month=period, through=through, previous_month=previous, basis='已确认经营销售', verified=False,
            warnings=warnings, updated_at=max((r.updated_at for r in rows), default=None), metrics=[metric('EXEC_SALES_AMT', '经营销售额', None, reason=why)],
            trend=[], rows=[], total_rows=0, total_change=None, other_change=None)
    current = [r for r in rows if period <= r.order_date <= through and included(r, cfg, verified)]
    prior = [r for r in rows if previous <= r.order_date <= month_end(previous) and included(r, cfg, verified)]
    comparable = not verified or prior_ready
    if not comparable:
        prior = []
        warnings.append('基期覆盖未确认，上期金额与变化贡献暂不可用')
    last_year = [r for r in rows if year_ago <= r.order_date <= month_end(year_ago) and included(r, cfg, verified)]
    total = sum((order_value(r, cfg, verified) for r in current), ZERO)
    old_total = sum((order_value(r, cfg, verified) for r in prior), ZERO)
    ytotal = sum((order_value(r, cfg, verified) for r in last_year), ZERO)
    sales = [r for r in current if normal_sale(r, cfg, verified)]
    customers = {r.customer_id for r in sales}
    historical = {r.customer_id for r in rows if r.order_date < period and normal_sale(r, cfg, verified)}
    counts = defaultdict(int)
    customer_amount = defaultdict(lambda: ZERO)
    for r in sales:
        counts[r.customer_id] += 1
    for r in current:
        customer_amount[r.customer_id] += order_value(r, cfg, verified)
    concentrations = sorted((customer_amount[c] for c in customers), reverse=True)
    earliest = min((r.order_date for r in rows), default=period)
    history_ready = bool(ready and cfg.full_history and review_ready(
        db, src, earliest, through, rows, actor.role_code != ROLE_OWNER)[0])
    # Source-basis metrics use a reconciliation code rather than silently claiming the official formula.
    def m(code, label, value, unit='元', reason=None):
        return metric(code if verified else 'DQ_SALES_RECON', label, value, unit, reason)
    metrics = [m('EXEC_SALES_AMT', '经营销售额' if verified else '源销售核对金额', total),
        m('SALE_ORDER_COUNT', '销售订单数' if verified else '源订单数', len(sales), '单'),
        m('SALE_CUSTOMER_COUNT', '成交客户数' if verified else '源订单客户数', len(customers), '个'),
        m('SALE_AOV', '平均客单价', ratio(total, len(sales)), reason='无销售订单'),
        m('SALE_MOM', '销售额环比', (total-old_total)/old_total*100 if old_total and prior_ready else None, '%',
          '基期为零或完整覆盖未确认'),
        m('SALE_YOY', '销售额同比', (total-ytotal)/ytotal*100 if ytotal and year_ready else None, '%', '去年同期缺失、为零或未确认'),
        m('CUS_NEW_TRANSACT', '首次成交客户数', len(customers-historical) if history_ready else None, '个', '完整历史未确认'),
        m('CUS_RETURNING', '回购客户数', len(customers & historical) if history_ready or not verified else None, '个', '完整历史未确认'),
        m('CUS_RETURN_RATE', '回购客户率', ratio(len(customers & historical)*100, len(customers)) if history_ready or not verified else None, '%', '无成交客户或完整历史未确认'),
        m('CUS_PERIOD_REPEAT', '期间复购客户率', ratio(sum(v >= 2 for v in counts.values())*100, len(customers)), '%', '无成交客户'),
        m('CUS_TOP5_SHARE', '前 5 客户销售占比', ratio(sum(concentrations[:5], ZERO)*100, total), '%', '销售额为零'),
        m('CUS_TOP20P_SHARE', '前 20% 客户集中度', ratio(sum(concentrations[:ceil(len(customers)/5)], ZERO)*100, total), '%', '销售额为零'),
        m('SALE_MOM_BASE', '上月完整月金额', old_total if prior_ready else None, reason=prior_why or '基期缺失'),
        m('SALE_YOY_BASE', '去年同期金额', ytotal if year_ready else None, reason='去年同期覆盖未确认')]
    if not cfg or not cfg.full_history:
        warnings.append('回购及最近成交仅依据已导入历史，首次真实成交与完整历史结论暂不可用')
    daily = {period + timedelta(days=i): ZERO for i in range((through-period).days+1)}
    for r in current:
        daily[r.order_date] += order_value(r, cfg, verified)
    buckets = defaultdict(lambda: {'current': ZERO, 'previous': ZERO, 'orders': set(), 'customers': set(), 'qty': ZERO, 'units': set()})
    names = {}
    all_ids = [r.id for r in current + prior]
    line_total = ZERO
    current_skus = set()
    if dimension == 'product':
        order_map = {r.id: r for r in current + prior}
        lines = db.execute(select(SalesOrderLine, Product.product_name).join(Product, Product.id == SalesOrderLine.product_id)
            .join(SalesOrder, SalesOrder.id == SalesOrderLine.sales_order_id).where(
                SalesOrder.id.in_(all_ids), SalesOrderLine.is_active, SalesOrderLine.version == SalesOrder.version)).all()
        for line, name in lines:
            order = order_map[line.sales_order_id]
            key = str(line.product_id)
            names[key] = name
            now = order.order_date >= period
            value = -abs(line.line_amount) if verified and order.source_status in cfg.return_statuses else line.line_amount
            b = buckets[key]
            b['current' if now else 'previous'] += value
            if now:
                if normal_sale(order, cfg, verified):
                    current_skus.add(line.product_id)
                line_total += value
                b['orders'].add(order.id)
                b['customers'].add(order.customer_id)
                b['qty'] += -abs(line.quantity) if verified and order.source_status in cfg.return_statuses else line.quantity
                b['units'].add(line.unit_name)
    else:
        for order in current + prior:
            key = str(order.customer_id if dimension == 'customer' else order.sales_user_id or 'unassigned')
            now = order.order_date >= period
            b = buckets[key]
            b['current' if now else 'previous'] += order_value(order, cfg, verified)
            if now:
                b['orders'].add(order.id)
                b['customers'].add(order.customer_id)
        if dimension == 'customer':
            names = {str(c.id): c.customer_name for c in db.scalars(select(Customer).where(Customer.id.in_([r.customer_id for r in current+prior])))}
        else:
            names = {str(u.id): u.display_name for u in db.scalars(select(User).where(User.id.in_([r.sales_user_id for r in current+prior if r.sales_user_id])))}
            names['unassigned'] = '未映射销售人员'
        current_skus = set(db.scalars(select(SalesOrderLine.product_id).join(SalesOrder, SalesOrder.id == SalesOrderLine.sales_order_id)
            .where(SalesOrder.id.in_([r.id for r in sales]), SalesOrderLine.is_active, SalesOrderLine.version == SalesOrder.version).distinct()))
    metrics.append(m('SALE_SKU_COUNT', '动销 SKU 数', len(current_skus), 'SKU'))
    ranked = sorted(buckets.items(), key=lambda item: (-abs(item[1]['current']-item[1]['previous']), item[0]))
    selected = ranked[offset:offset+limit]
    dims = [dto.DimensionRow(id=k, name=names.get(k, '未知'), current=money(b['current']), previous=money(b['previous']),
        change=money(b['current']-b['previous']), orders=len(b['orders']), customers=len(b['customers']),
        quantity=str(b['qty']) if dimension == 'product' and len(b['units']) == 1 else None,
        unit=next(iter(b['units'])) if dimension == 'product' and len(b['units']) == 1 else None,
        average_price=money(ratio(b['current'], b['qty'])) if dimension == 'product' and len(b['units']) == 1 and None not in b['units'] else None) for k, b in selected]
    if not comparable:
        for row in dims:
            row.previous = row.change = None
    dimension_change = sum((b['current']-b['previous'] for b in buckets.values()), ZERO)
    return dto.Analysis(month=period, through=through, previous_month=previous, basis='已确认经营销售' if verified else '源销售核对',
        verified=verified and ready, warnings=warnings, updated_at=max((r.updated_at for r in rows), default=None), metrics=metrics,
        trend=[dto.Point(date=d, value=money(v)) for d, v in daily.items()], rows=dims, total_rows=len(ranked),
        total_change=money(dimension_change) if comparable else None,
        other_change=money(dimension_change-sum((b['current']-b['previous'] for _, b in selected), ZERO)) if comparable else None,
        line_difference=money(total-line_total) if dimension == 'product' else None)


def orders(db, actor, sid, period, dimension=None, key=None, offset=0):
    src = source(db, actor, sid)
    query = select(SalesOrder).where(SalesOrder.source_system == src.source_code,
        SalesOrder.order_date >= month(period), SalesOrder.order_date <= min(month_end(period), utcnow().astimezone(TZ).date()),
        scope(db, actor, SalesOrder.sales_user_id))
    if key:
        if dimension == 'person' and key == 'unassigned':
            query = query.where(SalesOrder.sales_user_id.is_(None))
        else:
            try:
                uid = UUID(key)
            except ValueError:
                raise HTTPException(422, '维度标识无效') from None
            if dimension == 'customer':
                query = query.where(SalesOrder.customer_id == uid)
            elif dimension == 'person':
                query = query.where(SalesOrder.sales_user_id == uid)
            elif dimension == 'product':
                query = query.where(SalesOrder.id.in_(select(SalesOrderLine.sales_order_id).where(
                    SalesOrderLine.product_id == uid, SalesOrderLine.is_active, SalesOrderLine.version == SalesOrder.version)))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    return dto.OrderPage(total=total, rows=[dto.OrderRow(id=o.id, number=o.order_no, date=o.order_date,
        amount=money(o.sales_amount), status=o.source_status) for o in db.scalars(query.order_by(SalesOrder.order_date, SalesOrder.id).offset(offset).limit(30))])


def workbench(db, actor, uid, period):
    target_user = person(db, actor, uid)
    month(period)
    now = utcnow().astimezone(TZ)
    today = now.date()
    if period > month_start(today):
        through = period - timedelta(days=1)
    else:
        through = min(today, month_end(period))
    start_time = datetime.combine(period, time.min, TZ)
    end_time = min(now, datetime.combine(shift_month(period, 1), time.min, TZ) - timedelta(microseconds=1))
    config = settings(db)
    days = work_dates(period, uid, config)
    elapsed = [d for d in days if d <= today]
    target = db.scalar(select(SalesTarget).where(SalesTarget.user_id == uid, SalesTarget.period_month == period,
                                                 SalesTarget.target_type == TARGET_MONTHLY))
    source_rows = list(db.scalars(select(DataSource).where(DataSource.is_enabled,
        DataSource.source_code.in_(select(SalesOrder.source_system).distinct()))))
    actual = ZERO
    sales_ready = bool(source_rows) and through >= period
    deal_customers: set = set()
    warnings_unmapped: list[str] = []
    q_start = date(period.year, (period.month - 1) // 3 * 3 + 1, 1)
    q_end = month_end(shift_month(q_start, 2))
    q_through = min(today, q_end)
    quarter_actual, quarter_ready = ZERO, bool(source_rows) and q_through >= q_start
    for src in source_rows:
        scoped = load_orders(db, actor, src, uid)
        unmapped = db.scalar(select(func.count()).select_from(SalesOrder).where(
            SalesOrder.source_system == src.source_code, SalesOrder.sales_user_id.is_(None),
            period <= SalesOrder.order_date, SalesOrder.order_date <= month_end(period)))
        if unmapped:
            warnings_unmapped.append(f'数据源「{src.source_name}」{period:%Y-%m} 有 {unmapped} 笔订单未关联业务员：'
                '请在“数据中心 → 数据源与人员映射”保存映射，并重新导入原文件后才会归属到个人业绩。')
        ready, cfg, _ = review_ready(db, src, period, through, scoped, True)
        sales_ready &= ready
        if ready:
            actual += sum((order_value(o, cfg, True) for o in scoped if period <= o.order_date <= through), ZERO)
            deal_customers.update(o.customer_id for o in scoped if period <= o.order_date <= through)
        q_ready_src, q_cfg, _ = review_ready(db, src, q_start, q_through, scoped, True)
        quarter_ready &= q_ready_src
        if q_ready_src:
            quarter_actual += sum((order_value(o, q_cfg, True) for o in scoped if q_start <= o.order_date <= q_through), ZERO)
    # Restrict customer-linked process facts even after transfer; never leak another owner's customer.
    # Claims grant visibility like ownership (CRM 口径), so adopted pool customers count too.
    claimed = select(CustomerClaim.customer_id).where(CustomerClaim.user_id == uid)
    visible_customers = select(Customer.id).where(Customer.is_active,
        or_(scope(db, actor, Customer.owner_user_id), Customer.id.in_(claimed)))
    follows = list(db.scalars(select(Followup).where(Followup.owner_user_id == uid, Followup.is_active,
        Followup.customer_id.in_(visible_customers), Followup.occurred_at >= start_time, Followup.occurred_at <= end_time)))
    tasks = list(db.scalars(select(Task).where(Task.assignee_user_id == uid,
        or_(Task.customer_id.is_(None), Task.customer_id.in_(visible_customers)))))
    opps = list(db.scalars(select(Opportunity).where(Opportunity.owner_user_id == uid, Opportunity.is_active,
        Opportunity.status == 'open', Opportunity.customer_id.in_(visible_customers))))
    weighted_known = sum((o.estimated_amount * o.probability for o in opps if o.estimated_amount is not None and o.probability is not None), ZERO)
    pending = [o for o in opps if o.expected_close_date and period <= o.expected_close_date <= month_end(period)]
    pending_weighted = sum((o.estimated_amount*o.probability for o in pending if o.estimated_amount is not None and o.probability is not None), ZERO)
    missing = any(o.estimated_amount is None or o.probability is None for o in opps)
    pending_missing = any(o.estimated_amount is None or o.probability is None for o in pending)
    metrics = target_metrics(target.sales_amount_target if target else None, actual if sales_ready else None,
        days, today, None if pending_missing else pending_weighted, period)
    logs = list(db.scalars(select(ActivityLog).where(ActivityLog.user_id == uid,
        ActivityLog.occurred_at >= start_time, ActivityLog.occurred_at <= end_time)))
    work_set = set(elapsed)
    login_days = {a.occurred_at.astimezone(TZ).date() for a in logs if a.activity_type == 'user_login'} & work_set
    active_days = {a.occurred_at.astimezone(TZ).date() for a in logs if a.activity_type in config.effective_activity_types} & work_set
    due = [t for t in tasks if start_time <= t.due_at.astimezone(TZ) <= end_time and
           (config.cancelled_tasks != 'exclude' or t.status != 'cancelled')]
    done_due = [t for t in due if t.status == 'done' and t.completed_at and t.completed_at.astimezone(TZ) <= end_time]
    period_tasks = [t for t in tasks if period <= t.due_at.astimezone(TZ).date() <= month_end(period)]
    completed = [t for t in tasks if t.status == 'done' and t.completed_at and start_time <= t.completed_at.astimezone(TZ) <= end_time]
    new_customers = db.scalar(select(func.count()).select_from(Customer).where(
        Customer.is_active, Customer.id.in_(visible_customers), Customer.created_at >= start_time, Customer.created_at <= end_time))
    last_follow_sub = select(Followup.customer_id, func.max(Followup.occurred_at).label('last')).where(
        Followup.customer_id.in_(visible_customers), Followup.is_active).group_by(Followup.customer_id).subquery()
    stale_customers = db.scalar(select(func.count()).select_from(Customer).join(
        last_follow_sub, last_follow_sub.c.customer_id == Customer.id).where(
        Customer.is_active, last_follow_sub.c.last < utcnow() - timedelta(days=7)))
    metrics += [metric('CRM_LOGIN_DAY', '登录工作日', len(login_days), '天'),
        metric('CRM_EFFECTIVE_DAY', '有效活跃工作日', len(active_days), '天'),
        metric('CRM_ACTIVE_RATE', '有效活跃率', ratio(len(active_days)*100, len(elapsed)), '%', '尚无应工作日'),
        metric('CRM_FOLLOWUP_COUNT', '有效跟进次数', len(follows), '次'),
        metric('CRM_FOLLOWUP_CUSTOMERS', '有效跟进客户数', len({f.customer_id for f in follows}), '个'),
        metric('CRM_TASK_COUNT', '月内计划任务数', len(period_tasks), '个'),
        metric('CRM_TASK_DONE', '期间完成任务数', len(completed), '个'),
        metric('CRM_TASK_RATE', '已到期任务完成率', ratio(len(done_due)*100, len(due)) if config.cancelled_tasks else None, '%',
               '取消任务口径未设置或尚无到期任务'),
        metric('CRM_NEW_CUSTOMERS', '本月新增客户', new_customers, '个', reason='暂无新建客户'),
        metric('CRM_EFFECTIVE_FOLLOWUPS', '本月有效沟通', sum(1 for f in follows if f.is_effective), '次'),
        metric('CRM_QUOTED_CUSTOMERS', '本月报价客户', len({f.customer_id for f in follows if f.quotation_sent}), '个'),
        metric('CRM_DEAL_CUSTOMERS', '本月成交客户', len(deal_customers) if sales_ready else None, '个', reason='销售口径待核实'),
        metric('CRM_STALE_CUSTOMERS', '7天未跟进客户', stale_customers, '个', reason='暂无跟进记录客户'),
        metric('OPP_OPEN_AMT', '当前开放商机金额', sum((o.estimated_amount or ZERO for o in opps), ZERO) if all(o.estimated_amount is not None for o in opps) else None,
               reason='部分商机金额未填写'),
        metric('OPP_WEIGHTED_AMT', '当前加权商机金额', None if missing else weighted_known, reason='部分商机金额/概率未填写')]
    q_target = db.scalar(select(SalesTarget).where(SalesTarget.user_id == uid, SalesTarget.period_month == q_start,
                                                   SalesTarget.target_type == TARGET_QUARTERLY))
    q_completion = ratio(quarter_actual, q_target.sales_amount_target) if q_target and quarter_ready else None
    q_progress = ratio((q_through - q_start).days + 1, (q_end - q_start).days + 1)
    metrics += [metric('TGT_QUARTER_AMT', '季度销售目标', q_target.sales_amount_target if q_target else None, reason='季度目标未设置'),
        metric('TGT_QUARTER_COMPLETION', '季度目标完成率', q_completion * 100 if q_completion is not None else None, '%',
               '季度目标未设置或销售待核实'),
        metric('TGT_QUARTER_PROGRESS', '季度时间进度', q_progress * 100 if q_progress is not None else None, '%')]
    warnings = ['任务按当前截止时间与状态统计；延期后归入新到期日，历史完成时间保留。当前商机储备不代表历史月末快照。',
                '工作日默认周一至周五，节假日/休假由管理员维护；历史停用和入离职日期请用人员日历例外表达。']
    warnings += warnings_unmapped
    if not sales_ready:
        warnings.insert(0, '实际业绩待销售口径、期间覆盖及人员映射核实；目标与 CRM 功能可继续使用。')
    today_tasks = sum(t.status == 'todo' and t.due_at.astimezone(TZ).date() == today for t in tasks)
    week_start = today - timedelta(days=today.weekday())
    week_tasks = sum(t.status == 'todo' and week_start <= t.due_at.astimezone(TZ).date() < week_start+timedelta(days=7) for t in tasks)
    overdue = sum(t.status == 'todo' and t.due_at < now for t in tasks)
    return dto.Workbench(user_id=uid, name=target_user.display_name, month=period, through=through,
        metrics=metrics, warnings=warnings, today_tasks=today_tasks, week_tasks=week_tasks, overdue_tasks=overdue, open_opportunities=len(opps))


def attention(db, actor, sid, offset=0):
    src = source(db, actor, sid)
    today = utcnow().astimezone(TZ).date()
    rows = load_orders(db, actor, src)
    config = settings(db)
    review = db.get(SalesReview, sid)
    cfg = dto.ReviewInput.model_validate(review.value) if review else None
    # Never label customer loss from unverified or stale/incomplete history.
    earliest = min((r.order_date for r in rows), default=today)
    ready, cfg, reason = review_ready(db, src, earliest, today, rows, actor.role_code != ROLE_OWNER)
    warnings = []
    result = []
    customer_ids = set()
    if ready and cfg.full_history:
        last = {}
        this_year = set()
        last_year = set()
        for o in rows:
            if o.order_date > today or not normal_sale(o, cfg, True):
                continue
            last[o.customer_id] = max(last.get(o.customer_id, o.order_date), o.order_date)
            if month_start(o.order_date) == month_start(today):
                this_year.add(o.customer_id)
            if month_start(o.order_date) == shift_month(today, -12):
                last_year.add(o.customer_id)
        customer_ids = set(last)
        names = {c.id: c.customer_name for c in db.scalars(select(Customer).where(Customer.id.in_(customer_ids)))}
        for cid, last_date in last.items():
            days = (today-last_date).days
            kind = '疑似流失' if days >= config.lost_warning_days else '沉睡' if days > config.dormant_days else None
            if kind:
                result.append(dto.Attention(id=cid, name=names[cid], kind=kind, days=days))
        if cfg.coverage_from <= shift_month(today, -12):
            for cid in last_year-this_year:
                result.append(dto.Attention(id=cid, name=names[cid], kind='去年同月成交、本月尚未复购', days=(today-last[cid]).days))
    else:
        warnings.append(reason or '完整销售历史未确认，沉睡/疑似流失/同期未复购暂不判定')
    if actor.role_code != ROLE_FINANCE:
        customers = list(db.scalars(select(Customer).where(Customer.is_active, Customer.source_system == src.source_code,
            scope(db, actor, Customer.owner_user_id))))
        ids = [c.id for c in customers]
        last_follow = dict(db.execute(select(Followup.customer_id, func.max(Followup.occurred_at)).where(
            Followup.customer_id.in_(ids), Followup.is_active, Followup.occurred_at <= utcnow()).group_by(Followup.customer_id)).all())
        for c in customers:
            threshold = config.followup_days.get(c.customer_level)
            if threshold:
                stamp = last_follow.get(c.id)
                if stamp is None:
                    result.append(dto.Attention(id=c.id, name=c.customer_name, kind='尚无有效跟进记录'))
                elif (today-stamp.astimezone(TZ).date()).days > threshold:
                    result.append(dto.Attention(id=c.id, name=c.customer_name, kind='跟进超期', days=(today-stamp.astimezone(TZ).date()).days))
        if not config.followup_days:
            warnings.append('A/B/C 跟进超期阈值尚未配置')
    result.sort(key=lambda r: (-(r.days or 0), r.name, r.kind))
    counts: dict[str, int] = {}
    for r in result:
        counts[r.kind] = counts.get(r.kind, 0) + 1
    return dto.AttentionPage(rows=result[offset:offset+30], total=len(result), warnings=warnings, counts=counts)


RFM_SEGMENTS = [
    ('重要价值客户', 'R高F高M高', '重点维护，防止被竞争对手挖走'),
    ('重要保持客户', 'R低F高M高', '高频高额但久未成交，优先唤回'),
    ('重要发展客户', 'R高F低M高', '金额贡献高但频次低，推动复购'),
    ('重要挽留客户', 'R低F低M高', '高额但久未成交，安排重点挽回'),
    ('一般价值客户', 'R高F高M低', '活跃常客，尝试提升客单价'),
    ('一般保持客户', 'R低F高M低', '常态维护，观察需求变化'),
    ('一般发展客户', 'R高F低M低', '近期新成交，培育二次购买'),
    ('一般挽留客户', 'R低F低M低', '低频低额且沉睡，低成本批量维护'),
]
CONVERT_BUCKETS = [('3天内成交', 3), ('4-7天成交', 7), ('8-15天成交', 15), ('16-30天成交', 30), ('31-180天成交', 180), ('180天以上成交', None)]


def _rfm_layer(r_high: bool, f_high: bool, m_high: bool) -> str:
    key = f"{'R高' if r_high else 'R低'}{'F高' if f_high else 'F低'}{'M高' if m_high else 'M低'}"
    return next(name for name, combo, _ in RFM_SEGMENTS if combo == key)


def _source_customer_stats(db, actor, src):
    """Per-customer normal-sale history of one source; descriptive even before scope review, then labelled."""
    rows = load_orders(db, actor, src)
    today = utcnow().astimezone(TZ).date()
    earliest = min((r.order_date for r in rows if r.order_date <= today), default=today)
    ready, cfg, reason = review_ready(db, src, earliest, today, rows, actor.role_code != ROLE_OWNER)
    verified = bool(ready and cfg and cfg.full_history)
    warnings = []
    if not verified:
        warnings.append(reason or '销售核对口径未确认：分层与金额基于已导入订单，未按有效/退货/作废状态调整')
    stats: dict[UUID, dict] = {}
    visible = []
    for o in rows:
        if o.order_date > today or not included(o, cfg, verified):
            continue
        visible.append(o)
        s = stats.setdefault(o.customer_id, {'orders': 0, 'amount': ZERO, 'last': None})
        s['amount'] += order_value(o, cfg, verified)
        if normal_sale(o, cfg, verified):
            s['orders'] += 1
            s['last'] = o.order_date if s['last'] is None else max(s['last'], o.order_date)
    return stats, verified, warnings, today, visible, cfg


def _rfm_stats(stats, config, today):
    total = sum((s['amount'] for s in stats.values()), ZERO)
    customers = sum(s['orders'] > 0 for s in stats.values())
    average = total / customers if customers else ZERO
    enriched = {}
    for cid, s in stats.items():
        if s['last'] is None:
            continue  # Return-only history contributes money, not an invented normal sale.
        days = (today - s['last']).days
        enriched[cid] = {**s, 'days': days,
                         'layer': _rfm_layer(days <= config.rfm_recent_days, s['orders'] >= config.rfm_freq_orders,
                                             s['amount'] >= average)}
    return enriched, total


def customer_analytics(db, actor, sid):
    src = source(db, actor, sid)
    config = settings(db)
    stats, verified, warnings, today, visible, cfg = _source_customer_stats(db, actor, src)
    enriched, total = _rfm_stats(stats, config, today)
    customers = len(enriched)
    names = {c.id: c.customer_name for c in db.scalars(select(Customer).where(Customer.id.in_(stats)))}
    segments = []
    for name, _, hint in RFM_SEGMENTS:
        members = [s for s in enriched.values() if s['layer'] == name]
        amount = sum((s['amount'] for s in members), ZERO)
        segments.append(dto.SegmentRow(layer=name, hint=hint, count=len(members), amount=money(amount),
            share=str((amount/total*100).quantize(Decimal('0.1'))) if total else None))
    trend = []
    for i in range(5, -1, -1):
        m = month_start(shift_month(today, -i))
        end = min(today, month_end(m))
        month_rows = [o for o in visible if m <= o.order_date <= end]
        month_customers: dict[UUID, int] = {}
        for o in month_rows:
            if normal_sale(o, cfg, verified):
                month_customers[o.customer_id] = month_customers.get(o.customer_id, 0) + 1
        amount_m = sum((order_value(o, cfg, verified) for o in month_rows), ZERO)
        repeat = sum(v >= 2 for v in month_customers.values())  # CUS_PERIOD_REPEAT: fixed dictionary formula.
        orders_m = sum(month_customers.values())
        trend.append(dto.CustomerTrendMonth(month=m, amount=money(amount_m), orders=orders_m,
            customers=len(month_customers), repeat_rate=money(ratio(repeat*100, len(month_customers))) if month_customers else None,
            aov=money(ratio(amount_m, orders_m)) if orders_m else None))
    cycles = _conversion_cycles(db, actor, src, visible, cfg, verified)
    conversion_counted, conversion_average, buckets = _conversion_stats(cycles)
    current = trend[-1]
    metrics = [metric('SALE_CUSTOMER_COUNT', '本月成交客户数', current.customers, '个'),
        metric('CUS_PERIOD_REPEAT', '本月复购客户率', Decimal(current.repeat_rate) if current.repeat_rate else None, '%', '无成交客户'),
        metric('SALE_AOV', '本月平均客单价', Decimal(current.aov) if current.aov else None, reason='无有效订单'),
        metric('CUS_CONVERT_CYCLE', '平均成交转化周期', conversion_average, '天', '暂无可统计的潜客转化样本'),
        metric('CUS_RFM_LAYER', '重要价值+重要保持客户数', sum(1 for s in enriched.values() if s['layer'] in {'重要价值客户', '重要保持客户'}), '个')]
    ranked = sorted(enriched.items(), key=lambda kv: (-kv[1]['amount'], str(kv[0])))
    top = [dto.CustomerTopRow(customer_id=cid, name=names.get(cid, '未知客户'), layer=s['layer'],
        last_order_date=s['last'], days_since=s['days'], orders=s['orders'], amount=money(s['amount']),
        aov=money(ratio(s['amount'], s['orders']))) for cid, s in ranked[:20]]
    return dto.CustomerAnalytics(through=today, basis='已确认销售历史' if verified else '源销售核对（未确认口径）',
        verified=verified, warnings=warnings, metrics=metrics, segments=segments, trend=trend,
        conversion_counted=conversion_counted, conversion_average_days=money(conversion_average),
        conversion_buckets=buckets, top=top, total=customers)


def _conversion_cycles(db, actor, src, orders, cfg, verified):
    """CUS_CONVERT_CYCLE: retain inactive prospect aliases, authorize the current canonical owner."""
    if not verified:
        return {}  # First real sale requires reviewed statuses and complete history.
    targets = select(Customer.id).where(Customer.is_active, Customer.source_system == src.source_code,
                                        scope(db, actor, Customer.owner_user_id))
    prospects = db.scalars(select(Customer).where(Customer.source_system == 'crm',
        Customer.bound_customer_id.in_(targets))).all()
    first_order: dict[UUID, date] = {}
    for order in orders:  # Already source/date/sales-owner scoped.
        if normal_sale(order, cfg, True):
            first_order[order.customer_id] = min(first_order.get(order.customer_id, order.order_date), order.order_date)
    cycles = {}
    for p in prospects:
        first = first_order.get(p.bound_customer_id)
        if not first or p.created_at is None:
            continue
        cycle = (first - p.created_at.astimezone(TZ).date()).days
        if cycle < 0:
            continue
        cycles[p.bound_customer_id] = cycle
    return cycles


def _conversion_stats(cycles):
    days = list(cycles.values())
    buckets_map = {label: 0 for label, _ in CONVERT_BUCKETS}
    for cycle in days:
        for label, ceiling in CONVERT_BUCKETS:
            if ceiling is None or cycle <= ceiling:
                buckets_map[label] += 1
                break
    average = Decimal(sum(days)) / len(days) if days else None
    return len(days), average, [dto.ConvertBucket(label=label, count=buckets_map[label]) for label, _ in CONVERT_BUCKETS]


def customer_profile(db, actor, customer_id):
    require(actor, {ROLE_OWNER, ROLE_MANAGER, ROLE_SALES, ROLE_FINANCE})
    customer = db.get(Customer, customer_id)
    if not customer or not customer.is_active:
        raise HTTPException(404, '客户不存在')
    if actor.role_code not in FULL_ACCESS_ROLES:
        if not can_read_owned(services.principal_for(db, actor), customer.owner_user_id):
            raise HTTPException(404, '客户不存在或无权访问')
    warnings = []
    target_id = customer.bound_customer_id or customer.id
    history_customer = db.get(Customer, target_id)
    if history_customer is None:
        raise HTTPException(404, '客户不存在')
    source = db.scalar(select(DataSource).where(DataSource.source_code == history_customer.source_system,
                                                DataSource.is_enabled))
    config = settings(db)
    convert_days = None
    s = None
    if source is not None:
        stats, verified, warn, today, visible, cfg = _source_customer_stats(db, actor, source)
        convert_days = _conversion_cycles(db, actor, source, visible, cfg, verified).get(target_id)
        warnings.extend(warn)
        enriched, _ = _rfm_stats(stats, config, today)
        s = enriched.get(target_id)
    else:
        warnings.append('客户无关联销售数据源，暂无经营画像')
    if s is None:
        return dto.CustomerProfile(customer_id=customer.id, name=customer.customer_name,
            warnings=warnings + ['该客户暂无源销售记录，分层与复购待首次成交后可用'])
    return dto.CustomerProfile(customer_id=customer.id, name=customer.customer_name, layer=s['layer'],
        days_since=s['days'], last_order_date=s['last'], orders=s['orders'], amount=money(s['amount']),
        aov=money(ratio(s['amount'], s['orders'])), is_repeat=s['orders'] >= 2,
        convert_days=convert_days, warnings=warnings)


def _finance_metrics(db, src_id, months):
    """Map (statement, month) -> {code: value} for the requested months, reading only confirmed batch ids."""
    periods = {p.period_month: p for p in db.scalars(select(FinancialPeriod).where(
        FinancialPeriod.data_source_id == src_id, FinancialPeriod.period_month.in_(months)))}
    batch_ids = [b for p in periods.values() for b in (p.profit_import_batch_id, p.balance_import_batch_id) if b]
    values = defaultdict(dict)
    if batch_ids:
        for row in db.scalars(select(FinancialMetric).where(FinancialMetric.import_batch_id.in_(batch_ids))):
            key = 'period_value' if row.statement_type == 'profit' else 'end_value'
            values[(row.statement_type, row.period_month)][row.metric_code] = getattr(row, key)
    return periods, values


def overview(db, actor, source_id):
    """Owner first screen: business facts, financial results and balances side by side, never merged."""
    require(actor, {ROLE_OWNER, ROLE_FINANCE, ROLE_MANAGER, ROLE_SALES})
    src = source(db, actor, source_id)
    today = utcnow().astimezone(TZ).date()
    period = month_start(today)
    previous = shift_month(period, -1)
    rows = load_orders(db, actor, src)
    ready, cfg, why = review_ready(db, src, period, today, rows, actor.role_code != ROLE_OWNER)
    prior_ready, _, _ = review_ready(db, src, previous, month_end(previous), rows, actor.role_code != ROLE_OWNER)
    warnings = [why] if not ready else []
    if period == month_start(today):
        warnings.append(f'本月截至 {today}；环比基期为上月完整月，非同期进度比较')

    current = [r for r in rows if period <= r.order_date <= today]
    prior = [r for r in rows if previous <= r.order_date <= month_end(previous)]
    # V1 review fix: once the source scope review is confirmed, the overview uses the
    # verified EXEC_SALES_AMT formula (exclude voided, returns negative). Before that it
    # stays an explicitly-labelled source reconciliation, never presented as verified.
    verified = ready
    total = sum((order_value(r, cfg, verified) for r in current), ZERO)
    old_total = sum((order_value(r, cfg, verified) for r in prior), ZERO)
    sales_orders = [r for r in current if normal_sale(r, cfg, verified)]
    sales_customers = {r.customer_id for r in sales_orders}
    sales_metrics = [
        metric('EXEC_SALES_AMT' if verified else 'DQ_SALES_RECON', '经营销售额（本月）' if verified else '源销售核对金额（本月）',
               total, reason=why if not ready else None),
        metric('SALE_ORDER_COUNT', '销售订单数（本月）' if verified else '源订单数（本月）', len(sales_orders), '单'),
        metric('SALE_CUSTOMER_COUNT', '成交客户数（本月）', len(sales_customers), '个'),
        metric('SALE_MOM', '销售额环比', (total-old_total)/old_total*100 if old_total and (not verified or prior_ready) else None, '%',
               '基期缺失、为零或完整覆盖未确认'),
    ]

    finance_metrics = []
    finance_warnings = []
    finance_periods, values = _finance_metrics(db, src.id, [period, previous])
    profit = values.get(('profit', period), {})
    balance = values.get(('balance_sheet', period), {})
    prev_balance = values.get(('balance_sheet', previous), {})
    finance_visible = actor.role_code in {ROLE_OWNER, ROLE_FINANCE, ROLE_ADMIN}  # 2026-09-16 决策：admin 最高权限可见财务
    if finance_visible:
        if not profit:
            finance_warnings.append(f'{period.year}年{period.month}月利润表尚未导入或确认')
        if not balance:
            finance_warnings.append(f'{period.year}年{period.month}月资产负债表尚未导入或确认')
        revenue, cost = profit.get('revenue'), profit.get('cost')
        net_profit = profit.get('net_profit')
        cash, ar, inventory = balance.get('cash'), balance.get('ar'), balance.get('inventory')
        prev_cash = prev_balance.get('cash')
        has_revenue = revenue is not None and revenue != ZERO
        gross_margin = ratio(revenue-cost, revenue)*100 if has_revenue and cost is not None else None
        net_margin = ratio(net_profit, revenue)*100 if has_revenue and net_profit is not None else None
        cash_change = cash-prev_cash if cash is not None and prev_cash is not None else None
        finance_metrics = [
            metric('EXEC_FIN_REVENUE', '财务营业收入（本月）', revenue, reason='利润表未导入'),
            metric('EXEC_GROSS_MARGIN_FIN', '财务毛利率', gross_margin, '%', '利润表未导入或营业收入为零'),
            metric('EXEC_NET_PROFIT', '净利润（本月）', net_profit, reason='利润表未导入'),
            metric('EXEC_NET_MARGIN', '净利率', net_margin, '%', '利润表未导入或营业收入为零'),
            metric('EXEC_CASH_BAL', '货币资金余额', cash, reason='资产负债表未导入'),
            metric('EXEC_AR_BAL', '应收账款余额', ar, reason='资产负债表未导入'),
            metric('EXEC_INV_BAL', '存货余额', inventory, reason='资产负债表未导入'),
            metric('EXEC_CASH_MOM', '现金月度变化', cash_change, reason='上月或本月余额缺失'),
        ]
        if revenue is not None and ready:
            finance_metrics.append(metric('EXEC_RECON_DIFF', '经营-财务收入口径差异', total-revenue))
        elif revenue is not None:
            finance_warnings.append('销售数据未核实，经营-财务勾稽差异暂不计算')
        if profit and not finance_periods.get(period).is_closed:
            finance_warnings.append('本月财务期间尚未确认，数值为待确认版本')

    # Six-month trend uses the same basis as the headline figure.
    trend = []
    customer_trend = []
    for i in range(5, -1, -1):
        m = shift_month(period, -i)
        end = min(today, month_end(m))
        amount = sum((order_value(r, cfg, verified) for r in rows if m <= r.order_date <= end), ZERO)
        trend.append(dto.Point(date=m, value=str(amount)))
        customer_trend.append(dto.Point(date=m, value=str(len({r.customer_id for r in rows
            if m <= r.order_date <= end and normal_sale(r, cfg, verified)}))))

    # Owner dashboard extras. Everything below reuses the verified-basis orders already loaded.
    customer_structure: list[dto.StructureSlice] = []
    product_structure: list[dto.StructureSlice] = []
    person_ranking: list[dto.PersonRankRow] = []
    attention_items: list[dto.AttentionItem] = []
    attention_total = 0
    customer_contributions = []
    if actor.role_code == ROLE_OWNER:
        sale_orders = [r for r in current if normal_sale(r, cfg, verified)]
        customer_amounts = defaultdict(lambda: ZERO)
        for r in current:
            if not included(r, cfg, verified):
                continue
            customer_amounts[r.customer_id] += order_value(r, cfg, verified)
        customer_counts = defaultdict(int)
        for r in sale_orders:
            customer_counts[r.customer_id] += 1
        for c, owner_name in db.execute(select(Customer, User.display_name)
                .outerjoin(User, User.id == Customer.owner_user_id).where(Customer.id.in_(customer_amounts))):
            customer_contributions.append(dto.CustomerContribution(customer_id=c.id, name=c.customer_name,
                owner_name=owner_name, level=c.customer_level, amount=money(customer_amounts[c.id]),
                orders=customer_counts[c.id]))
        customer_contributions.sort(key=lambda row: (-Decimal(row.amount), str(row.customer_id)))
        if customer_amounts and total:
            levels = defaultdict(lambda: [ZERO, 0])
            for c in db.scalars(select(Customer).where(Customer.id.in_(customer_amounts))):
                lv = c.customer_level or '未分级'
                levels[lv][0] += customer_amounts[c.id]
                levels[lv][1] += 1
            for lv, (lv_amount, count) in sorted(levels.items(), key=lambda kv: kv[1][0], reverse=True):
                customer_structure.append(dto.StructureSlice(label=f'{lv} · {count}家', amount=money(lv_amount),
                    share=str((lv_amount/total*100).quantize(Decimal('0.1'))) if total else None))
        normal_ids = [r.id for r in sale_orders]
        if normal_ids and total:
            product_sums = db.execute(select(Product.product_name, func.sum(SalesOrderLine.line_amount).label('amount'))
                .join(SalesOrderLine, SalesOrderLine.product_id == Product.id)
                .join(SalesOrder, SalesOrder.id == SalesOrderLine.sales_order_id)
                .where(SalesOrder.id.in_(normal_ids), SalesOrderLine.is_active,
                       SalesOrderLine.version == SalesOrder.version)
                .group_by(Product.id, Product.product_name).order_by(func.sum(SalesOrderLine.line_amount).desc())).all()
            shown = ZERO
            for name, amount in product_sums[:5]:
                product_structure.append(dto.StructureSlice(label=name, amount=money(amount),
                    share=str((amount/total*100).quantize(Decimal('0.1'))) if total else None))
                shown += amount
            rest = sum((amount for _, amount in product_sums[5:]), ZERO)
            if rest:
                product_structure.append(dto.StructureSlice(label='其他商品', amount=money(rest),
                    share=str((rest/total*100).quantize(Decimal('0.1')))))
        rank_people = db.scalars(select(User).where(User.is_active, User.role_code.in_(['sales', 'manager']))).all()
        amounts_by_user = defaultdict(lambda: ZERO)
        for r in current:
            if r.sales_user_id:
                amounts_by_user[r.sales_user_id] += order_value(r, cfg, verified)
        for p in rank_people:
            amount = amounts_by_user.get(p.id, ZERO)
            target = db.scalar(select(SalesTarget).where(SalesTarget.user_id == p.id, SalesTarget.period_month == period,
                                                         SalesTarget.target_type == TARGET_MONTHLY))
            target_amount = target.sales_amount_target if target else None
            person_ranking.append(dto.PersonRankRow(user_id=p.id, name=p.display_name, amount=money(amount),
                target=money(target_amount),
                completion=str((amount/target_amount*100).quantize(Decimal('0.1'))) if target_amount not in (None, ZERO) and verified else None))
        person_ranking.sort(key=lambda row: Decimal(row.amount), reverse=True)
        page = attention(db, actor, src.id, 0)
        attention_total = page.total
        attention_items = [dto.AttentionItem(customer_id=r.id, name=r.name, kind=r.kind, days=r.days) for r in page.rows[:4]]

    return dto.Overview(month=period, through=today, verified=verified, warnings=warnings,
                        finance_warnings=finance_warnings, sales_metrics=sales_metrics,
                        finance_metrics=finance_metrics, trend=trend, customer_trend=customer_trend,
                        customer_contributions=customer_contributions[:5],
                        customer_structure=customer_structure, product_structure=product_structure,
                        person_ranking=person_ranking, attention_items=attention_items,
                        attention_total=attention_total,
                        updated_at=max((r.updated_at for r in rows), default=None))
