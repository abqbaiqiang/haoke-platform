from datetime import datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import exists, func, or_, select, update

from app import crm_schemas as dto, services
from app.crm_models import Assignment, Contact, CRMSetting, CustomerTag, Followup, Opportunity, Tag, Task
from app.data_models import Customer, Product, SalesOrder, SalesOrderLine
from app.models import ActivityLog, User, utcnow
from app.permissions import can_read_owned

TZ = ZoneInfo('Asia/Shanghai')


def settings(db):
    row = db.get(CRMSetting, 1)
    return dto.Settings.model_validate(row.value if row else {})


def role(actor, allowed):
    if actor.role_code not in allowed:
        raise HTTPException(403, '无此 CRM 操作权限')


def owns(db, actor, owner):
    return actor.role_code == 'admin' or can_read_owned(services.principal_for(db, actor), owner)


def scope(db, actor, column):
    if actor.role_code in {'owner', 'admin'}:
        return True
    principal = services.principal_for(db, actor)
    ids = [actor.id] if actor.role_code == 'sales' else []
    if actor.role_code == 'manager' and principal.scope_type == 'team':
        ids = list(principal.member_ids) + [actor.id]
    if actor.role_code == 'finance' and principal.scope_type == 'custom':
        ids = list(principal.member_ids)
    return column.in_(ids)


def customer(db, actor, cid, lock=False):
    query = select(Customer).where(Customer.id == cid)
    obj = db.scalar(query.with_for_update().execution_options(populate_existing=True) if lock else query)
    if not obj or not obj.is_active or not owns(db, actor, obj.owner_user_id):
        raise HTTPException(404, '客户不存在或无权访问')
    return obj


def event(db, actor, action, cid, obj=None, before=None, after=None):
    db.add(ActivityLog(user_id=actor.id, activity_type=action, object_type='crm_customer', object_id=cid,
                       details=jsonable_encoder({'resource_id':obj, 'before':before, 'after':after})))


def snapshot(obj):
    return jsonable_encoder({c.key:getattr(obj, c.key) for c in obj.__table__.columns})


def people(db, actor):
    return db.scalars(select(User).where(User.is_active, User.role_code.in_(['sales','manager']), scope(db, actor, User.id))
                      .order_by(User.display_name)).all()


def assignee(db, actor, uid, cust=None):
    target = db.get(User, uid)
    if not target or not target.is_active or target.role_code not in {'sales','manager'} or not owns(db, actor, uid):
        raise HTTPException(422, '负责人不在可分配范围')
    if cust and not can_read_owned(services.principal_for(db, target), cust.owner_user_id):
        raise HTTPException(422, '执行人没有该客户的访问权限，请先转交客户')
    return target


def list_customers(db, actor, q='', pool=False, tag_id=None, offset=0, limit=30):
    if pool:
        role(actor, {'owner','admin','manager','sales'})
    query = select(Customer).where(Customer.is_active)
    query = query.where(Customer.ownership_status == 'public_pool') if pool else query.where(scope(db, actor, Customer.owner_user_id))
    if q:
        query = query.where(or_(Customer.customer_name.icontains(q, autoescape=True), Customer.customer_code.icontains(q, autoescape=True)))
    if tag_id:
        query = query.where(exists().where(CustomerTag.customer_id == Customer.id, CustomerTag.tag_id == tag_id))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = [dto.CustomerView.model_validate(x) for x in db.scalars(query.order_by(Customer.customer_name, Customer.id).offset(offset).limit(limit))]
    if pool and actor.role_code not in {'owner','admin'}:
        for row in rows:
            row.remark = None
    return {'rows':rows, 'total':total}


def create_customer(db, actor, payload):
    role(actor, {'sales','manager'})
    normalized = ''.join(payload.customer_name.split()).replace('（','(').replace('）',')')
    duplicate = db.scalar(select(Customer.id).where(Customer.is_active, Customer.normalized_name == normalized).limit(1)) is not None
    if payload.mobile:
        duplicate |= db.scalar(select(Contact.id).where(Contact.mobile == payload.mobile, Contact.is_active).limit(1)) is not None
    obj = Customer(source_system='crm', customer_name=payload.customer_name, normalized_name=normalized,
                   owner_user_id=actor.id, ownership_status='owned', crm_managed=True, remark=payload.remark)
    db.add(obj)
    db.flush()
    if payload.mobile:
        db.add(Contact(customer_id=obj.id, name='待补充联系人', mobile=payload.mobile))
    event(db, actor, 'customer_create', obj.id, after=snapshot(obj))
    db.commit()
    return {'customer':obj, 'duplicate_warning':duplicate}


def patch_customer(db, actor, cid, payload):
    role(actor, {'owner','admin','manager','sales'})
    obj = customer(db, actor, cid, True)
    data = payload.model_dump(exclude_unset=True)
    if actor.role_code == 'sales' and set(data) - {'remark','customer_name'}:
        raise HTTPException(403, '客户分类、级别与状态由经理维护')
    if 'customer_name' in data and (obj.source_system != 'crm' or obj.bound_customer_id):
        raise HTTPException(409, '精斗云客户名称只读')
    if data.get('customer_name', 'valid') is None or data.get('lifecycle_status', 'valid') is None:
        raise HTTPException(422, '名称和状态不能为空')
    before = snapshot(obj)
    obj.crm_managed = True
    for key, value in data.items():
        setattr(obj, key, value)
    if 'customer_name' in data:
        obj.normalized_name = ''.join(obj.customer_name.split()).replace('（','(').replace('）',')')
    event(db, actor, 'customer_update', cid, before=before, after=snapshot(obj))
    db.commit()
    return obj


def transfer(db, actor, cid, payload, claim=False):
    role(actor, {'sales','manager'} if claim else {'owner','admin','manager'})
    if claim:
        obj = db.scalar(select(Customer).where(Customer.id == cid).with_for_update().execution_options(populate_existing=True))
        if not obj or not obj.is_active or obj.ownership_status != 'public_pool' or obj.owner_user_id:
            raise HTTPException(409, '客户已被领取或不在公海')
        if not settings(db).public_pool_claim_enabled:
            raise HTTPException(403, '公海领取已关闭')
        uid, reason = actor.id, '本人领取公海客户'
    else:
        obj = customer(db, actor, cid, True)
        uid, reason = payload.owner_user_id, payload.reason
        if uid:
            assignee(db, actor, uid)
    old = obj.owner_user_id
    state = 'owned' if uid else 'public_pool'
    if old == uid and obj.ownership_status == state:
        return obj
    obj.owner_user_id, obj.ownership_status, obj.crm_managed = uid, state, True
    obj.public_pool_entered_at = utcnow() if uid is None else None
    action = 'claim' if claim else 'release_to_pool' if uid is None else 'transfer' if old else 'assign'
    db.add(Assignment(customer_id=cid, from_user_id=old, to_user_id=uid, action_type=action, reason=reason, operated_by=actor.id))
    event(db, actor, 'customer_transfer', cid, before={'owner_user_id':old}, after={'owner_user_id':uid,'action':action,'reason':reason})
    # Open work follows a new owner. Closed work retains its historical performer.
    for model, field, status in [(Task,'assignee_user_id','todo'), (Opportunity,'owner_user_id','open')]:
        for item in db.scalars(select(model).where(model.customer_id == cid, model.status == status).with_for_update()):
            before = snapshot(item)
            if uid:
                setattr(item, field, uid)
            event(db, actor, 'task_transfer' if model == Task else 'opportunity_transfer', cid, item.id, before, snapshot(item))
    if obj.bound_customer_id:
        target = db.scalar(select(Customer).where(Customer.id == obj.bound_customer_id).with_for_update())
        target.owner_user_id, target.ownership_status, target.crm_managed = uid, state, True
    db.commit()
    return obj


def bind(db, actor, cid, target_id):
    role(actor, {'owner','admin','manager'})
    # Lock both rows in stable order, including the unassigned ERP target.
    locked = {x.id:x for x in db.scalars(select(Customer).where(Customer.id.in_([cid,target_id])).order_by(Customer.id).with_for_update().execution_options(populate_existing=True))}
    obj = locked.get(cid)
    if not obj or not owns(db,actor,obj.owner_user_id):
        raise HTTPException(404,'客户不存在或无权访问')
    target = locked.get(target_id)
    if obj.bound_customer_id == target_id:
        return customer(db,actor,target_id)
    if not obj.is_active or obj.source_system != 'crm' or obj.bound_customer_id or not target or not target.is_active or target.source_system == 'crm':
        raise HTTPException(409, '仅未绑定潜客可绑定精斗云正式客户')
    if target.owner_user_id not in {None, obj.owner_user_id} or target.crm_managed:
        raise HTTPException(409, '正式客户已有 CRM 管理记录，请人工核对，不能自动合并')
    if db.scalar(select(Customer.id).where(Customer.bound_customer_id == target_id)):
        raise HTTPException(409, '正式客户已绑定其他潜客')
    for model in [Contact, Followup, Task, Opportunity, CustomerTag, Assignment]:
        if db.scalar(select(model).where(model.customer_id == target_id).limit(1)):
            raise HTTPException(409, '正式客户已有过程记录，不能自动合并')
    obj.bound_customer_id, obj.bound_at, obj.is_active = target.id, utcnow(), False
    target.owner_user_id, target.ownership_status, target.crm_managed = obj.owner_user_id, obj.ownership_status, True
    target.bound_at = obj.bound_at
    target.remark, target.customer_level, target.customer_type = obj.remark, obj.customer_level, obj.customer_type
    target.lifecycle_status = obj.lifecycle_status
    for model in [Contact, Followup, Task, Opportunity, CustomerTag, Assignment]:
        db.execute(update(model).where(model.customer_id == cid).values(customer_id=target.id))
    # Keep original audit object IDs; the destination timeline includes the inactive source alias.
    event(db, actor, 'customer_bind', cid, after={'target_id':target.id, 'source_system':target.source_system,'customer_code':target.customer_code})
    db.add(Assignment(customer_id=target.id, from_user_id=None, to_user_id=obj.owner_user_id, action_type='assign',
                      reason='潜客绑定正式客户', operated_by=actor.id))
    db.commit()
    return target


def save_contact(db, actor, cid, payload, contact_id=None):
    role(actor, {'owner','manager','sales','admin'} if contact_id else {'owner','manager','sales'})
    cust = customer(db, actor, cid, True)
    cust.crm_managed = True
    obj = db.get(Contact, contact_id) if contact_id else Contact(customer_id=cid)
    if not obj or obj.customer_id != cid:
        raise HTTPException(404, '联系人不存在或无权访问')
    before = snapshot(obj) if contact_id else None
    for k,v in payload.model_dump().items():
        setattr(obj,k,v)
    db.add(obj)
    db.flush()
    event(db, actor, 'contact_update' if contact_id else 'contact_create', cid, obj.id, before, snapshot(obj))
    db.commit()
    return obj


def save_followup(db, actor, cid, payload, fid=None):
    role(actor, {'manager','sales'})
    cust = customer(db, actor, cid, True)
    cust.crm_managed = True
    obj = db.get(Followup, fid) if fid else Followup(customer_id=cid, owner_user_id=actor.id)
    if not obj or obj.customer_id != cid or (fid and not obj.is_active):
        raise HTTPException(404, '跟进不存在或无权访问')
    if fid and actor.role_code == 'sales' and (obj.owner_user_id != actor.id or utcnow() - obj.created_at > timedelta(hours=settings(db).followup_edit_hours)):
        raise HTTPException(403, '只能在配置时限内修改自己的跟进')
    if payload.contact_id:
        contact = db.get(Contact,payload.contact_id)
        if not contact or contact.customer_id != cid or not contact.is_active:
            raise HTTPException(422, '联系人不属于当前客户')
    before = snapshot(obj) if fid else None
    old_task = db.scalar(select(Task).where(Task.followup_id == fid).with_for_update()) if fid else None
    if old_task and old_task.status != 'todo' and (payload.next_action != obj.next_action or payload.next_followup_at != obj.next_followup_at):
        raise HTTPException(409, '关联待办已结束，请新增跟进安排下一步')
    for k,v in payload.model_dump().items():
        setattr(obj,k,v if k != 'occurred_at' or v is not None else obj.occurred_at or utcnow())
    db.add(obj)
    db.flush()
    if payload.next_followup_at:
        target_id = cust.owner_user_id or actor.id
        if old_task is None:
            old_task = Task(customer_id=cid, followup_id=obj.id, source_type='followup', task_type='followup',
                            assignee_user_id=target_id, created_by=actor.id)
            db.add(old_task)
        if old_task.status in {None, 'todo'}:
            old_task.title, old_task.due_at = payload.next_action, payload.next_followup_at
    elif old_task and old_task.status == 'todo':
        old_task.status = 'cancelled'
    event(db, actor, 'followup_update' if fid else 'followup_create', cid, obj.id, before, snapshot(obj))
    db.commit()
    return obj


def work_access(db, actor, obj, field):
    if not obj or not owns(db, actor, getattr(obj, field)):
        raise HTTPException(404, '记录不存在或无权访问')
    if obj.customer_id:
        customer(db, actor, obj.customer_id)
    return obj


def task_create(db, actor, payload):
    role(actor, {'owner','manager','sales'})
    cust = customer(db, actor, payload.customer_id, True) if payload.customer_id else None
    assignee(db, actor, payload.assignee_user_id, cust)
    if payload.opportunity_id:
        opp = work_access(db, actor, db.get(Opportunity,payload.opportunity_id), 'owner_user_id')
        if not cust or opp.customer_id != cust.id:
            raise HTTPException(422, '商机不属于当前客户')
    obj = Task(**payload.model_dump(), source_type='manual' if payload.assignee_user_id == actor.id else 'manager', created_by=actor.id)
    db.add(obj)
    db.flush()
    event(db, actor, 'task_create', obj.customer_id, obj.id, after=snapshot(obj))
    db.commit()
    return obj


def task_patch(db, actor, tid, payload):
    role(actor, {'owner','manager','sales'})
    # Lock the customer before its work, matching transfer/binding lock order.
    initial = db.get(Task, tid)
    if not initial:
        raise HTTPException(404, '记录不存在或无权访问')
    if initial.customer_id:
        customer(db, actor, initial.customer_id, True)
    obj = work_access(db, actor, db.scalar(select(Task).where(Task.id == tid).with_for_update()
                                         .execution_options(populate_existing=True)), 'assignee_user_id')
    before = snapshot(obj)
    if payload.status:
        if obj.status != 'todo' and payload.status != obj.status:
            raise HTTPException(409, '已结束待办不能重新打开，请创建新待办')
        if obj.status != payload.status:
            obj.status = payload.status
            obj.completed_at = utcnow() if payload.status == 'done' else None
    if payload.due_at:
        if obj.status != 'todo':
            raise HTTPException(409, '只能延期未完成待办')
        obj.due_at = payload.due_at
    if 'completion_result' in payload.model_fields_set:
        obj.completion_result = payload.completion_result
    if before != snapshot(obj):
        event(db, actor, 'task_complete' if obj.status == 'done' else 'task_update', obj.customer_id, obj.id, before, snapshot(obj))
    db.commit()
    return obj


def task_window(view, now=None):
    now = (now or utcnow()).astimezone(TZ)
    start = datetime.combine(now.date(),time.min,TZ)
    if view == 'today':
        return start, start + timedelta(days=1)
    if view == 'week':
        start -= timedelta(days=start.weekday())
        return start, start + timedelta(days=7)
    if view == 'overdue':
        return None, now
    if view == 'future':
        return start + timedelta(days=1), None
    return None, None


def tasks(db, actor, view='today', offset=0):
    role(actor, {'owner','admin','manager','sales'})
    ids = select(Customer.id).where(Customer.is_active, scope(db, actor, Customer.owner_user_id))
    query = select(Task).where(scope(db, actor, Task.assignee_user_id), or_(Task.customer_id.is_(None),Task.customer_id.in_(ids)))
    query = query.where(Task.status == ('done' if view == 'done' else 'todo'))
    start,end = task_window(view)
    if start:
        query = query.where(Task.due_at >= start)
    if end:
        query = query.where(Task.due_at < end)
    return db.scalars(query.order_by(Task.due_at,Task.id).offset(offset).limit(100)).all()


def weighted(amount, probability):
    return None if amount is None or probability is None else format((amount * probability).quantize(Decimal('.01'), rounding=ROUND_HALF_UP), '.2f')


def opportunity_view(obj):
    result = dto.OpportunityView.model_validate(obj)
    # OPP_WEIGHTED_AMT: only open opportunities contribute. No sales facts are changed.
    result.weighted_amount = weighted(obj.estimated_amount,obj.probability) if obj.status == 'open' else None
    return result


def save_opportunity(db, actor, cid, payload, oid=None):
    role(actor, {'manager','sales'})
    cust = customer(db, actor, cid, True)
    cust.crm_managed = True
    assignee(db, actor,payload.owner_user_id,cust)
    obj = work_access(db, actor, db.get(Opportunity,oid),'owner_user_id') if oid else Opportunity(customer_id=cid)
    if obj.customer_id != cid:
        raise HTTPException(404, '商机不存在或无权访问')
    before = snapshot(obj) if oid else None
    if oid and obj.status != 'open' and payload.stage != obj.stage:
        raise HTTPException(409, '已关闭商机不能重新流转，请建立新商机')
    for k,v in payload.model_dump().items():
        setattr(obj,k,v)
    obj.status = payload.stage if payload.stage in {'won','lost'} else 'open'
    if obj.status in {'won', 'lost'} and obj.closed_at is None:
        obj.closed_at = utcnow()
    db.add(obj)
    db.flush()
    event(db, actor, 'opportunity_update' if oid else 'opportunity_create', cid, obj.id, before,snapshot(obj))
    db.commit()
    return opportunity_view(obj)


def detail(db, actor, cid, history_offset=0):
    obj = customer(db, actor,cid)
    finance = actor.role_code == 'finance'
    def work(model, column):
        return db.scalars(select(model).where(model.customer_id == cid,scope(db,actor,column))
                          .order_by(model.created_at.desc(), model.id).offset(history_offset).limit(51)).all()
    tags = db.scalars(select(Tag).join(CustomerTag,CustomerTag.tag_id == Tag.id).where(CustomerTag.customer_id == cid)).all()
    orders = select(SalesOrder).where(SalesOrder.customer_id == (obj.bound_customer_id or cid),scope(db,actor,SalesOrder.sales_user_id))
    history_ids = [cid] + list(db.scalars(select(Customer.id).where(Customer.bound_customer_id == cid)))
    result = dto.CustomerView.model_validate(obj)
    if obj.bound_customer_id:
        target = db.get(Customer,obj.bound_customer_id)
        result.customer_code = target.customer_code
        result.customer_name = target.customer_name
    # DQ_SALES_RECON: source sales sums, not an inferred accounting or ERP-status metric.
    sales = orders.subquery()
    year_start = utcnow().astimezone(TZ).date().replace(month=1, day=1)
    summary = db.execute(select(func.count(sales.c.id), func.sum(sales.c.sales_amount),
                                func.sum(sales.c.sales_amount).filter(sales.c.order_date >= year_start, sales.c.order_date < year_start.replace(year=year_start.year+1)),
                                func.max(sales.c.order_date))).one()
    products = db.execute(select(Product.product_name, func.sum(SalesOrderLine.line_amount).label('amount'))
                          .join(SalesOrderLine, SalesOrderLine.product_id == Product.id)
                          .where(SalesOrderLine.is_active, SalesOrderLine.sales_order_id.in_(select(sales.c.id)))
                          .group_by(Product.id, Product.product_name).order_by(func.sum(SalesOrderLine.line_amount).desc(), Product.id)
                          .limit(5)).all()
    response = {'customer':result,
            'contacts':db.scalars(select(Contact).where(Contact.customer_id == cid).order_by(Contact.created_at)).all(),
            'tags':tags,
            'followups':[] if finance else db.scalars(select(Followup).where(Followup.customer_id == cid).order_by(Followup.occurred_at.desc(), Followup.id).offset(history_offset).limit(51)).all(),
            'tasks':[] if finance else work(Task,Task.assignee_user_id),
            'opportunities':[] if finance else [opportunity_view(x) for x in work(Opportunity,Opportunity.owner_user_id)],
            'events':[] if finance else db.scalars(select(ActivityLog).where(ActivityLog.object_type == 'crm_customer',ActivityLog.object_id.in_(history_ids)).order_by(ActivityLog.occurred_at.desc(), ActivityLog.id).offset(history_offset).limit(51)).all(),
            'orders':db.scalars(orders.order_by(SalesOrder.order_date.desc(), SalesOrder.id).offset(history_offset).limit(51)).all(),
            'sales_summary': {'metric_code':'DQ_SALES_RECON', 'order_count':summary[0],
                              'total_amount':format(summary[1] or Decimal('0'), '.2f'),
                              'year_amount':format(summary[2] or Decimal('0'), '.2f'), 'last_order_date':summary[3],
                              'top_products':[{'name':x.product_name,'amount':format(x.amount,'.2f')} for x in products]}}
    histories = ['followups', 'tasks', 'opportunities', 'events', 'orders']
    response['has_more_history'] = any(len(response[k]) > 50 for k in histories)
    for key in histories:
        response[key] = response[key][:50]
    return response


def void_followup(db, actor, cid, fid, reason):
    role(actor, {'owner', 'admin'})
    customer(db, actor, cid, True)
    obj = db.get(Followup, fid)
    if not obj or obj.customer_id != cid:
        raise HTTPException(404, '跟进不存在或无权访问')
    if obj.is_active:
        before = snapshot(obj)
        obj.is_active = False
        task = db.scalar(select(Task).where(Task.followup_id == fid).with_for_update())
        if task and task.status == 'todo':
            old_task = snapshot(task)
            task.status = 'cancelled'
            event(db, actor, 'task_update', cid, task.id, old_task, snapshot(task))
        event(db, actor, 'followup_void', cid, obj.id, before, {'is_active':False, 'reason':reason})
        db.commit()
    return obj
