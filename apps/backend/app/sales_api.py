from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Query

from app import crm_schemas as dto, sales_workspace as svc
from app.crm_api import Actor, DB

router = APIRouter(prefix='/api/sales', tags=['销售日常工作'])


@router.get('/monthly-trend', response_model=svc.MonthlyTrend)
def monthly_trend(source_id: UUID, month: date, db: DB, actor: Actor):
    return svc.monthly_trend(db, actor, source_id, month)


@router.get('/performance', response_model=svc.Performance)
def performance(source_id: UUID, db: DB, actor: Actor,
                from_month: date = Query(alias='from'), to_month: date = Query(alias='to'),
                months: int = Query(6, ge=6, le=12)):
    return svc.performance(db, actor, source_id, from_month, to_month, months)


@router.get('/customers', response_model=svc.Customers)
def customers(db: DB, actor: Actor, q: str = Query('', max_length=100), pool: bool = False,
              offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100),
              claim: Literal['claimed', 'unclaimed'] | None = None,
              level: str | None = Query(None, max_length=8), tag_id: UUID | None = None):
    return svc.customers(db, actor, q, pool, offset, limit, claim, level, tag_id)


@router.get('/opportunities', response_model=svc.RecentOpportunities)
def recent_opportunities(db: DB, actor: Actor, days: int = Query(30, ge=1, le=180),
                         limit: int = Query(10, ge=1, le=50)):
    return svc.recent_opportunities(db, actor, days, limit)


@router.get('/tasks', response_model=svc.Tasks)
def tasks(db: DB, actor: Actor, view: Literal['today', 'overdue', 'week', 'future', 'done'] = 'today',
          offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100)):
    return svc.tasks(db, actor, view, offset, limit)


@router.get('/recent', response_model=svc.Recent)
def recent(db: DB, actor: Actor, offset: int = Query(0, ge=0), limit: int = Query(5, ge=1, le=100)):
    return svc.recent(db, actor, offset, limit)


@router.post('/customers/{cid}/followup', response_model=dto.FollowupView, status_code=201)
def followup(cid: UUID, payload: svc.FollowupAction, db: DB, actor: Actor):
    return svc.followup(cid, payload, db, actor)
