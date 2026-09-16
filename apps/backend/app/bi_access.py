"""BI 装载层：权限入口、配置/目标/数据源的读写与订单加载（docs/29 C4 拆分）。"""
from datetime import date
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from app import bi_schemas as dto, services
from app.bi_calculations import ZERO, money
from app.bi_models import BISetting, SalesReview, SalesTarget
from app.config import get_settings
from app.constants import FULL_ACCESS_ROLES, ROLE_ADMIN, ROLE_FINANCE, ROLE_MANAGER, ROLE_OWNER, ROLE_SALES, \
    SALES_ACTOR_ROLES, TARGET_MONTHLY, TARGET_QUARTERLY
from app.data_models import DataSource, SalesOrder
from app.models import ActivityLog, User, utcnow
from app.permissions import can_read_owned

TZ = ZoneInfo(get_settings().app_timezone)


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


def load_orders(db, actor, src, uid=None):
    query = select(SalesOrder).where(SalesOrder.source_system == src.source_code,
                                    scope(db, actor, SalesOrder.sales_user_id))
    if uid:
        query = query.where(SalesOrder.sales_user_id == uid)
    return list(db.scalars(query.order_by(SalesOrder.order_date, SalesOrder.id)))
