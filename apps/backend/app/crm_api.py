from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError

from app import crm_schemas as dto, crm_service as svc
from app.constants import ALL_WORK_ROLES, FULL_ACCESS_ROLES, ROLE_ADMIN, ROLE_MANAGER, ROLE_OWNER, ROLE_SALES, \
    SALES_ACTOR_ROLES
from app.crm_models import CRMSetting, CustomerTag, Followup, Opportunity, Tag
from app.data_models import Customer, Product
from app.deps import Actor, DB

router = APIRouter(prefix='/api/crm', tags=['CRM'])


@router.get('/settings', response_model=dto.Settings)
def settings(db: DB, actor: Actor):
    return svc.settings(db)


@router.put('/settings', response_model=dto.Settings)
def update_settings(payload: dto.Settings, db: DB, actor: Actor):
    svc.role(actor, FULL_ACCESS_ROLES)
    obj = db.get(CRMSetting, 1)
    before = obj.value if obj else dto.Settings().model_dump()
    if not obj:
        obj = CRMSetting(id=1)
        db.add(obj)
    obj.value = payload.model_dump()
    svc.event(db, actor, 'crm_setting_update', None, before=before, after=obj.value)
    db.commit()
    return payload


@router.get('/people', response_model=list[dto.Person])
def people(db: DB, actor: Actor):
    return svc.people(db,actor)


@router.get('/customers', response_model=dto.CustomerPage)
def customers(db: DB, actor: Actor, q: str = Query('', max_length=100), pool: bool = False,
              tag_id: UUID | None = None, offset: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100),
              level: str | None = Query(None, max_length=8),
              ownership: Literal['unassigned', 'owned', 'public_pool'] | None = None,
              claim: Literal['claimed', 'unclaimed'] | None = None):
    return svc.list_customers(db,actor,q,pool,tag_id,offset,limit,level,ownership,claim)


@router.post('/customers/batch-assign', response_model=dto.BatchAssignResult)
def batch_assign(payload: dto.BatchAssign, db: DB, actor: Actor):
    return svc.batch_assign(db, actor, payload)


@router.post('/customers/batch-claim', response_model=dto.BatchClaimResult)
def batch_claim(payload: dto.BatchClaim, db: DB, actor: Actor):
    return svc.batch_claim(db, actor, payload)


@router.get('/binding-candidates', response_model=list[dto.CustomerView])
def binding_candidates(db: DB, actor: Actor, q: str = Query(min_length=1,max_length=100)):
    svc.role(actor,{ROLE_OWNER,ROLE_ADMIN,ROLE_MANAGER})
    bound = select(Customer.bound_customer_id).where(Customer.bound_customer_id.is_not(None))
    rows = db.scalars(select(Customer).where(Customer.is_active,Customer.source_system != 'crm',~Customer.crm_managed,
        Customer.owner_user_id.is_(None), Customer.id.not_in(bound), Customer.customer_name.icontains(q,autoescape=True)).limit(30)).all()
    result = [dto.CustomerView.model_validate(x) for x in rows]
    for row in result:
        row.remark = None
    return result


@router.get('/followups', response_model=list[dto.FollowupView])
def followups(db: DB, actor: Actor, offset: int = Query(0,ge=0)):
    svc.role(actor,ALL_WORK_ROLES)
    return db.scalars(select(Followup).join(Customer,Customer.id == Followup.customer_id)
        .where(Customer.is_active,svc.customer_scope(db,actor,Customer.owner_user_id))
        .order_by(Followup.occurred_at.desc(),Followup.id).offset(offset).limit(100)).all()


@router.get('/opportunities', response_model=list[dto.OpportunityView])
def opportunities(db: DB, actor: Actor, offset: int = Query(0,ge=0), owner_user_id: UUID | None = None,
                  status: Literal['open','won','lost','cancelled'] | None = None):
    svc.role(actor,ALL_WORK_ROLES)
    query = select(Opportunity).join(Customer,Customer.id == Opportunity.customer_id).where(
        Customer.is_active,svc.customer_scope(db,actor,Customer.owner_user_id),svc.scope(db,actor,Opportunity.owner_user_id))
    if owner_user_id:
        query = query.where(Opportunity.owner_user_id == owner_user_id)
    if status:
        query = query.where(Opportunity.status == status)
    rows = db.scalars(query.order_by(Opportunity.updated_at.desc(),Opportunity.id).offset(offset).limit(100)).all()
    views = [svc.opportunity_view(db, x) for x in rows]
    return views


@router.post('/customers', response_model=dto.CustomerCreated, status_code=201)
def create_customer(payload: dto.CustomerCreate, db: DB, actor: Actor):
    return svc.create_customer(db,actor,payload)


@router.post('/customers/pool', response_model=dto.CustomerCreated, status_code=201)
def create_pool_customer(payload: dto.CustomerCreate, db: DB, actor: Actor):
    return svc.create_pool_customer(db,actor,payload)


@router.post('/customers/pool-import', response_model=dto.PoolImportResult, status_code=201)
def pool_import(payload: dto.PoolImport, db: DB, actor: Actor):
    return svc.pool_import(db,actor,payload)


@router.get('/customers/{cid}', response_model=dto.CustomerDetail)
def detail(cid: UUID, db: DB, actor: Actor, history_offset: int = Query(0, ge=0)):
    return svc.detail(db,actor,cid,history_offset)


@router.patch('/customers/{cid}', response_model=dto.CustomerView)
def patch_customer(cid: UUID, payload: dto.CustomerPatch, db: DB, actor: Actor):
    return svc.patch_customer(db,actor,cid,payload)


@router.post('/customers/{cid}/transfer', response_model=dto.CustomerView)
def transfer(cid: UUID, payload: dto.Transfer, db: DB, actor: Actor):
    return svc.transfer(db,actor,cid,payload)


@router.post('/customers/{cid}/claim', response_model=dto.CustomerView)
def claim(cid: UUID, db: DB, actor: Actor):
    return svc.transfer(db,actor,cid,None,True)


@router.post('/customers/{cid}/bind', response_model=dto.CustomerView)
def bind(cid: UUID, payload: dto.Bind, db: DB, actor: Actor):
    return svc.bind(db,actor,cid,payload.target_id)


@router.post('/customers/{cid}/contacts', response_model=dto.ContactView, status_code=201)
def contact_create(cid: UUID, payload: dto.ContactInput, db: DB, actor: Actor):
    return svc.save_contact(db,actor,cid,payload)


@router.put('/customers/{cid}/contacts/{contact_id}', response_model=dto.ContactView)
def contact_update(cid: UUID, contact_id: UUID, payload: dto.ContactInput, db: DB, actor: Actor):
    return svc.save_contact(db,actor,cid,payload,contact_id)


@router.post('/customers/{cid}/followups', response_model=dto.FollowupView, status_code=201)
def followup_create(cid: UUID, payload: dto.FollowupInput, db: DB, actor: Actor):
    return svc.save_followup(db,actor,cid,payload)


@router.put('/customers/{cid}/followups/{fid}', response_model=dto.FollowupView)
def followup_update(cid: UUID, fid: UUID, payload: dto.FollowupInput, db: DB, actor: Actor):
    return svc.save_followup(db,actor,cid,payload,fid)


@router.post('/customers/{cid}/followups/{fid}/void', response_model=dto.FollowupView)
def followup_void(cid: UUID, fid: UUID, payload: dto.VoidInput, db: DB, actor: Actor):
    return svc.void_followup(db, actor, cid, fid, payload.reason)


@router.get('/products')
def products(db: DB, actor: Actor, q: str = Query('', max_length=100), limit: int = Query(50, ge=1, le=200)):
    svc.role(actor, ALL_WORK_ROLES)
    query = select(Product.id, Product.product_name).where(Product.is_active)
    if q:
        query = query.where(or_(Product.product_name.icontains(q, autoescape=True),
                                Product.product_code.icontains(q, autoescape=True)))
    return [{'id': str(pid), 'name': name} for pid, name in db.execute(query.order_by(Product.product_name).limit(limit)).all()]


@router.get('/tags', response_model=list[dto.TagView])
def tags(db: DB, actor: Actor):
    svc.ensure_default_tags(db, actor)
    return db.scalars(select(Tag).order_by(Tag.tag_name)).all()


def save_tag(db,actor,payload,tid=None):
    # Tags are self-service: anyone may create (gated by sales_create_tags), and a tag's
    # creator keeps rename/deactivate rights on their own tags; owner/admin manage all.
    if tid is None:
        allowed = FULL_ACCESS_ROLES | (SALES_ACTOR_ROLES if svc.settings(db).sales_create_tags else set())
        svc.role(actor,allowed)
        obj = Tag(created_by=actor.id)
    else:
        svc.role(actor,{ROLE_ADMIN,ROLE_OWNER,ROLE_SALES,ROLE_MANAGER})
        obj = db.get(Tag,tid)
        if not obj:
            raise HTTPException(404,'标签不存在')
        if actor.role_code not in FULL_ACCESS_ROLES and obj.created_by != actor.id:
            raise HTTPException(403,'只能修改或停用自己创建的标签')
    before = svc.snapshot(obj) if tid else None
    for k,v in payload.model_dump().items():
        setattr(obj,k,v)
    db.add(obj)
    try:
        db.flush()
        svc.event(db,actor,'tag_update' if tid else 'tag_create',None,obj.id,before,svc.snapshot(obj))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409,'标签名称已存在') from None
    return obj


@router.post('/tags', response_model=dto.TagView, status_code=201)
def create_tag(payload: dto.TagInput, db: DB, actor: Actor):
    return save_tag(db,actor,payload)


@router.put('/tags/{tid}', response_model=dto.TagView)
def update_tag(tid: UUID, payload: dto.TagInput, db: DB, actor: Actor):
    return save_tag(db,actor,payload,tid)


@router.put('/customers/{cid}/tags', response_model=list[dto.TagView])
def assign_tags(cid: UUID, payload: dto.TagsInput, db: DB, actor: Actor):
    svc.role(actor,ALL_WORK_ROLES)
    svc.customer(db,actor,cid,True).crm_managed = True
    chosen = set(payload.tag_ids)
    old = db.scalars(select(CustomerTag).where(CustomerTag.customer_id == cid)).all()
    before = [x.tag_id for x in old]
    for tid in chosen:
        tag = db.get(Tag,tid)
        if not tag or (not tag.is_active and tid not in before):
            raise HTTPException(422,'标签不存在或已停用')
    for obj in old:
        if obj.tag_id not in chosen:
            db.delete(obj)  # Association only; old/new membership is retained in immutable audit.
    for tid in chosen-set(before):
        db.add(CustomerTag(customer_id=cid,tag_id=tid,created_by=actor.id))
    svc.event(db,actor,'customer_tags_update',cid,before=before,after=list(chosen))
    db.commit()
    return db.scalars(select(Tag).where(Tag.id.in_(chosen))).all()


@router.get('/tasks', response_model=list[dto.TaskView])
def tasks(db: DB, actor: Actor, view: Literal['today','week','overdue','future','done'] = 'today', offset: int = Query(0,ge=0),
          assignee_user_id: UUID | None = None):
    return svc.tasks(db,actor,view,offset,assignee_user_id)


@router.post('/tasks', response_model=dto.TaskView, status_code=201)
def task_create(payload: dto.TaskInput, db: DB, actor: Actor):
    return svc.task_create(db,actor,payload)


@router.patch('/tasks/{tid}', response_model=dto.TaskView)
def task_patch(tid: UUID, payload: dto.TaskPatch, db: DB, actor: Actor):
    return svc.task_patch(db,actor,tid,payload)


@router.post('/customers/{cid}/opportunities', response_model=dto.OpportunityView, status_code=201)
def opportunity_create(cid: UUID, payload: dto.OpportunityInput, db: DB, actor: Actor):
    return svc.save_opportunity(db,actor,cid,payload)


@router.put('/customers/{cid}/opportunities/{oid}', response_model=dto.OpportunityView)
def opportunity_update(cid: UUID, oid: UUID, payload: dto.OpportunityInput, db: DB, actor: Actor):
    return svc.save_opportunity(db,actor,cid,payload,oid)
