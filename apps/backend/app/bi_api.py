from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import select

from app import bi_schemas as dto, bi_service as svc
from app.bi_models import SalesReview
from app.deps import Actor, DB

router = APIRouter(prefix='/api/bi', tags=['销售工作台与分析'])


@router.get('/people', response_model=list[dto.Person])
def people(db: DB, actor: Actor):
    return svc.people(db, actor, config=True)


@router.get('/settings', response_model=dto.Settings)
def settings(db: DB, actor: Actor):
    svc.require(actor, {'admin', 'owner'})
    return svc.settings(db)


@router.put('/settings', response_model=dto.Settings)
def save_settings(payload: dto.Settings, db: DB, actor: Actor):
    return svc.save_settings(db, actor, payload)


@router.get('/targets/{uid}', response_model=dto.TargetView)
def target(uid: UUID, month: date, db: DB, actor: Actor, type: Literal['monthly', 'quarterly'] = 'monthly'):
    return svc.get_target(db, actor, uid, month, type)


@router.put('/targets/{uid}', response_model=dto.TargetView)
def save_target(uid: UUID, month: date, payload: dto.TargetInput, db: DB, actor: Actor,
                type: Literal['monthly', 'quarterly'] = 'monthly'):
    return svc.save_target(db, actor, uid, month, payload, type)


@router.get('/sources', response_model=list[dto.SourceView])
def sources(db: DB, actor: Actor):
    return svc.sources(db, actor)


@router.get('/reviews/{sid}', response_model=dto.ReviewInput | None)
def review(sid: UUID, db: DB, actor: Actor):
    svc.source(db, actor, sid, True)
    obj = db.scalar(select(SalesReview).where(SalesReview.source_id == sid))
    return obj.value if obj else None


@router.put('/reviews/{sid}', response_model=dto.ReviewInput)
def save_review(sid: UUID, payload: dto.ReviewInput, db: DB, actor: Actor):
    return svc.save_review(db, actor, sid, payload)


@router.get('/workbench/{uid}', response_model=dto.Workbench)
def workbench(uid: UUID, month: date, db: DB, actor: Actor):
    return svc.workbench(db, actor, uid, month)


@router.get('/team', response_model=dto.Team)
def team(month: date, db: DB, actor: Actor, offset: int = Query(0, ge=0)):
    svc.require(actor, {'owner', 'manager'})
    people = svc.people(db, actor)
    return dto.Team(rows=[svc.workbench(db, actor, p.id, month) for p in people[offset:offset+20]], total=len(people))


@router.get('/sales', response_model=dto.Analysis)
def sales(source_id: UUID, month: date, db: DB, actor: Actor,
          dimension: Literal['customer', 'product', 'person'] = 'customer',
          basis: Literal['source', 'verified'] = 'source', offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100)):
    return svc.analysis(db, actor, source_id, month, dimension, offset, limit, basis)


@router.get('/orders', response_model=dto.OrderPage)
def orders(source_id: UUID, month: date, db: DB, actor: Actor,
           dimension: Literal['customer', 'product', 'person'] | None = None,
           key: str | None = Query(None, max_length=64), offset: int = Query(0, ge=0)):
    return svc.orders(db, actor, source_id, month, dimension, key, offset)


@router.get('/attention', response_model=dto.AttentionPage)
def attention(source_id: UUID, db: DB, actor: Actor, offset: int = Query(0, ge=0)):
    return svc.attention(db, actor, source_id, offset)


@router.get('/customer-analytics', response_model=dto.CustomerAnalytics)
def customer_analytics(source_id: UUID, db: DB, actor: Actor):
    return svc.customer_analytics(db, actor, source_id)


@router.get('/customer-profile/{customer_id}', response_model=dto.CustomerProfile)
def customer_profile(customer_id: UUID, db: DB, actor: Actor):
    return svc.customer_profile(db, actor, customer_id)


@router.get('/overview', response_model=dto.Overview)
def overview(source_id: UUID, db: DB, actor: Actor):
    return svc.overview(db, actor, source_id)
