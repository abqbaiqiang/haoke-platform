"""Scoped CORE/CRM analysis; unverified source reconciliation stays explicitly separate."""
from collections import defaultdict
from datetime import date, datetime, time, timedelta
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
from app.crm_models import Followup, Opportunity, Task
from app.data_models import Customer, DataSource, Product, SalesOrder, SalesOrderLine
from app.models import ActivityLog, User, utcnow
from app.permissions import can_read_owned

TZ = ZoneInfo('Asia/Shanghai')


def require(actor, roles):
    if actor.role_code not in roles:
        raise HTTPException(403, '无此分析或配置权限')


def scope(db, actor, column):
    require(actor, {'owner', 'manager', 'sales', 'finance'})
    p = services.principal_for(db, actor)
    if p.role == 'owner':
        return True
    ids = {p.user_id} if p.role in {'sales', 'manager'} else set()
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
    require(actor, {'admin'})
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
    if config and actor.role_code == 'admin':
        condition = True
    else:
        require(actor, {'owner', 'manager', 'sales'})
        condition = scope(db, actor, User.id)
    return [dto.Person(id=u.id, name=u.display_name) for u in db.scalars(select(User).where(
        User.is_active, User.role_code.in_(['sales', 'manager']), condition).order_by(User.display_name, User.id))]


def person(db, actor, uid, admin_read=False):
    if not (admin_read and actor.role_code == 'admin'):
        require(actor, {'owner', 'manager', 'sales'})
        if not can_read_owned(services.principal_for(db, actor), uid):
            raise HTTPException(404, '人员不存在或无权访问')
    target = db.get(User, uid)
    if not target or not target.is_active or target.role_code not in {'sales', 'manager'}:
        raise HTTPException(404, '人员不存在或无权访问')
    return target


def get_target(db, actor, uid, period):
    person(db, actor, uid, admin_read=True)
    obj = db.scalar(select(SalesTarget).where(SalesTarget.user_id == uid, SalesTarget.period_month == month(period)))
    return dto.TargetView(user_id=uid, month=period, amount=money(obj.sales_amount_target) if obj else None,
                          remark=obj.remark if obj else None)


def save_target(db, actor, uid, period, payload):
    require(actor, {'owner', 'manager'})
    target = person(db, actor, uid)
    month(period)
    # Serialize absent-row upserts and their audit snapshots with a stable existing row lock.
    db.execute(select(User.id).where(User.id == target.id).with_for_update())
    obj = db.scalar(select(SalesTarget).where(SalesTarget.user_id == uid, SalesTarget.period_month == period))
    before = {'amount': money(obj.sales_amount_target), 'remark': obj.remark} if obj else None
    if obj is None:
        obj = SalesTarget(user_id=uid, period_month=period, created_by=actor.id)
        db.add(obj)
    obj.sales_amount_target, obj.remark = payload.amount, payload.remark
    db.flush()
    audit(db, actor, 'sales_target_update', obj.id, before, {'amount': money(payload.amount), 'remark': payload.remark})
    db.commit()
    return get_target(db, actor, uid, period)


def sources(db, actor):
    require(actor, {'owner', 'manager', 'sales', 'finance', 'admin'})
    query = select(DataSource).where(DataSource.is_enabled)
    if actor.role_code not in {'owner', 'admin'}:
        visible = select(SalesOrder.source_system).where(scope(db, actor, SalesOrder.sales_user_id)).distinct()
        query = query.where(DataSource.source_code.in_(visible))
    return [dto.SourceView(id=s.id, name=s.source_name) for s in db.scalars(query.order_by(DataSource.source_name))]


def source(db, actor, sid, config=False):
    if config:
        require(actor, {'owner', 'admin'})
    else:
        require(actor, {'owner', 'manager', 'sales', 'finance'})
    obj = db.get(DataSource, sid)
    if not obj or not obj.is_enabled:
        raise HTTPException(404, '数据源不存在或无权访问')
    if not config and actor.role_code != 'owner':
        allowed = db.scalar(select(SalesOrder.id).where(SalesOrder.source_system == obj.source_code,
                            scope(db, actor, SalesOrder.sales_user_id)).limit(1))
        if not allowed:
            raise HTTPException(404, '数据源不存在或无权访问')
    return obj


def latest_fact(db, src):
    return db.scalar(select(func.max(SalesOrder.updated_at)).where(SalesOrder.source_system == src.source_code))


def save_review(db, actor, sid, payload):
    require(actor, {'admin'})
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
        return False, None, '有效销售、退货/作废及导出覆盖待确认'
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
    ready, cfg, why = review_ready(db, src, period, through, rows, actor.role_code != 'owner')
    prior_ready, _, prior_why = review_ready(db, src, previous, month_end(previous), rows, actor.role_code != 'owner')
    year_ready, _, _ = review_ready(db, src, year_ago, month_end(year_ago), rows, actor.role_code != 'owner')
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
        db, src, earliest, through, rows, actor.role_code != 'owner')[0])
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
    target = db.scalar(select(SalesTarget).where(SalesTarget.user_id == uid, SalesTarget.period_month == period))
    source_rows = list(db.scalars(select(DataSource).where(DataSource.is_enabled,
        DataSource.source_code.in_(select(SalesOrder.source_system).distinct()))))
    actual = ZERO
    sales_ready = bool(source_rows) and through >= period
    for src in source_rows:
        scoped = load_orders(db, actor, src, uid)
        ready, cfg, _ = review_ready(db, src, period, through, scoped, True)
        sales_ready &= ready
        if ready:
            actual += sum((order_value(o, cfg, True) for o in scoped if period <= o.order_date <= through), ZERO)
    # Restrict customer-linked process facts even after transfer; never leak another owner's customer.
    visible_customers = select(Customer.id).where(Customer.is_active, scope(db, actor, Customer.owner_user_id))
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
    metrics += [metric('CRM_LOGIN_DAY', '登录工作日', len(login_days), '天'),
        metric('CRM_EFFECTIVE_DAY', '有效活跃工作日', len(active_days), '天'),
        metric('CRM_ACTIVE_RATE', '有效活跃率', ratio(len(active_days)*100, len(elapsed)), '%', '尚无应工作日'),
        metric('CRM_FOLLOWUP_COUNT', '有效跟进次数', len(follows), '次'),
        metric('CRM_FOLLOWUP_CUSTOMERS', '有效跟进客户数', len({f.customer_id for f in follows}), '个'),
        metric('CRM_TASK_COUNT', '月内计划任务数', len(period_tasks), '个'),
        metric('CRM_TASK_DONE', '期间完成任务数', len(completed), '个'),
        metric('CRM_TASK_RATE', '已到期任务完成率', ratio(len(done_due)*100, len(due)) if config.cancelled_tasks else None, '%',
               '取消任务口径未设置或尚无到期任务'),
        metric('OPP_OPEN_AMT', '当前开放商机金额', sum((o.estimated_amount or ZERO for o in opps), ZERO) if all(o.estimated_amount is not None for o in opps) else None,
               reason='部分商机金额未填写'),
        metric('OPP_WEIGHTED_AMT', '当前加权商机金额', None if missing else weighted_known, reason='部分商机金额/概率未填写')]
    warnings = ['任务按当前截止时间与状态统计；延期后归入新到期日，历史完成时间保留。当前商机储备不代表历史月末快照。',
                '工作日默认周一至周五，节假日/休假由管理员维护；历史停用和入离职日期请用人员日历例外表达。']
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
    ready, cfg, reason = review_ready(db, src, earliest, today, rows, actor.role_code != 'owner')
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
    if actor.role_code != 'finance':
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
    return dto.AttentionPage(rows=result[offset:offset+30], total=len(result), warnings=warnings)
