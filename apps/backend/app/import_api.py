import uuid
from zoneinfo import ZoneInfo
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app import import_service as svc, services
from app.config import get_settings
from app.import_parser import BALANCE_NAMES, PROFIT_NAMES
from app.data_models import (Customer, DataSource, FinancialMetric, FinancialPeriod, ImportBatch,
                             RawImportRow, SalesOrder, SalesOrderLine)
from app.db import get_db
from app.models import User, utcnow
from app.permissions import can_read_owned

router = APIRouter(prefix='/api/data', tags=['数据中心'])
DB = Annotated[Session, Depends(get_db)]


def identity(request: Request, db: DB):
    return services.authenticate(db, request.cookies.get('songmao_session'))[0]


Actor = Annotated[User, Depends(identity)]
Kind = Literal['customer', 'product', 'sales', 'profit', 'balance_sheet']


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid')


class SourceCreate(Strict):
    source_code: str = Field(min_length=1, max_length=64, pattern=r'^[a-z][a-z0-9_]*$')
    source_name: str = Field(min_length=1, max_length=100)
    entity_name: str = Field(min_length=1, max_length=255)


class SourceConfig(Strict):
    staff: dict[str, uuid.UUID] = Field(default_factory=dict, max_length=200)


class ImportOptions(Strict):
    mapping: dict[str, int] = Field(default_factory=dict, max_length=30)
    blank_as_zero: bool = False


class Confirmation(Strict):
    acknowledge_warnings: bool = False
    replace_version: bool = False


class PeriodConfirmation(Strict):
    is_closed: bool


class BatchView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    data_source_id: uuid.UUID
    business_type: str
    original_filename: str
    file_hash: str
    status: str
    date_from: date | None
    date_to: date | None
    total_rows: int
    success_rows: int
    error_rows: int
    started_at: datetime
    finished_at: datetime | None
    duplicate_of: uuid.UUID | None
    preview: dict


class FinancialPreviewRow(BaseModel):
    row: int
    metric_code: str
    metric_name: str
    period_value: str | None
    ytd_value: str | None
    begin_value: str | None
    end_value: str | None


class FinancialPreview(BaseModel):
    batch_id: uuid.UUID
    filename: str
    status: str
    statement_type: Literal['profit', 'balance_sheet']
    entity_name: str
    period: date
    blank_as_zero: bool
    requires_blank_confirmation: bool
    warnings: list[str]
    records: list[FinancialPreviewRow]


@router.get('/sources')
def sources(db: DB, actor: Actor):
    svc.authorize(actor)
    return [{'id': s.id, 'source_code': s.source_code, 'source_name': s.source_name, 'entity_name': s.entity_name,
             'last_success_at': s.last_success_at, 'staff': s.config_json.get('staff', {}) if actor.role_code in {'admin', 'owner'} else {}}
            for s in db.scalars(select(DataSource).where(DataSource.is_enabled).order_by(DataSource.created_at))]


@router.post('/sources', status_code=201)
def create_source(payload: SourceCreate, db: DB, actor: Actor):
    if actor.role_code not in {'admin', 'owner'}:
        raise HTTPException(403, '仅老板或管理员可创建数据源')
    obj = DataSource(**payload.model_dump())
    db.add(obj)
    try:
        db.flush()
        svc.audit(db, actor, 'data_source_create', obj.id)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, '数据源编码已存在') from None
    return {'id': obj.id}


@router.get('/mapping-users')
def mapping_users(db: DB, actor: Actor):
    if actor.role_code not in {'admin', 'owner'}:
        raise HTTPException(403, '仅老板或管理员可配置账号映射')
    return [{'id': u.id, 'username': u.username, 'display_name': u.display_name} for u in db.scalars(select(User).where(User.is_active))]


@router.put('/sources/{source_id}/staff')
def staff_config(source_id: uuid.UUID, payload: SourceConfig, db: DB, actor: Actor):
    if actor.role_code not in {'admin', 'owner'}:
        raise HTTPException(403, '仅老板或管理员可配置账号映射')
    src = svc.source(db, source_id, True)
    for name, user_id in payload.staff.items():
        target = db.get(User, user_id)
        if not name.strip() or len(name) > 100 or not target or not target.is_active:
            raise HTTPException(422, '人员名称或目标账号无效')
    src.config_json = {'staff': {k: str(v) for k, v in payload.staff.items()}}
    svc.audit(db, actor, 'source_staff_mapping', src.id, {'count': len(payload.staff)})
    db.commit()
    return {'status': 'ok', 'message': '用于新预检；不追溯修改已导入历史归属'}


@router.delete('/sources/{source_id}/data')
def purge_source_data(source_id: uuid.UUID, db: DB, actor: Actor, confirm: str = Query(min_length=1, max_length=100)):
    if actor.role_code not in {'admin', 'owner'}:
        raise HTTPException(403, '仅老板或管理员可清空导入数据')
    src = svc.source(db, source_id, True)
    if confirm.strip() != src.source_name:
        raise HTTPException(422, '确认文字与数据源名称不一致，未执行任何删除')
    return svc.purge_source_data(db, src, actor)


@router.post('/imports', response_model=BatchView, status_code=201)
async def upload(request: Request, db: DB, actor: Actor, source_id: uuid.UUID, kind: Kind,
                 filename: str = Query(max_length=255), options: str = Query(default='{}', max_length=10000)):
    svc.authorize(actor, kind, True)
    accepted = {'application/octet-stream', 'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'}
    if request.headers.get('content-type', '').split(';')[0] not in accepted:
        raise HTTPException(415, '上传请求类型不受支持')
    try:
        config = ImportOptions.model_validate_json(options).model_dump()
    except ValidationError:
        raise HTTPException(422, '预检选项无效') from None
    maximum = get_settings().import_max_bytes
    if request.headers.get('content-length', '').isdigit() and int(request.headers['content-length']) > maximum:
        raise HTTPException(413, '文件过大')
    data = bytearray()
    async for chunk in request.stream():
        if len(data)+len(chunk) > maximum:
            raise HTTPException(413, '文件过大')
        data.extend(chunk)
    return await run_in_threadpool(svc.upload, db, actor, source_id, kind, filename, bytes(data), config)


@router.get('/imports', response_model=list[BatchView])
def batches(db: DB, actor: Actor, offset: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100)):
    svc.authorize(actor)
    query = select(ImportBatch)
    if actor.role_code == 'finance':
        query = query.where(ImportBatch.business_type.in_(svc.FINANCE))
    return db.scalars(query.order_by(ImportBatch.started_at.desc()).offset(offset).limit(limit)).all()


@router.get('/imports/{batch_id}', response_model=BatchView)
def batch_detail(batch_id: uuid.UUID, db: DB, actor: Actor):
    return svc.batch_access(db, actor, batch_id)


@router.get('/imports/{batch_id}/finance-preview', response_model=FinancialPreview)
def financial_preview(batch_id: uuid.UUID, db: DB, actor: Actor):
    return svc.finance_preview(db, actor, batch_id)


@router.post('/imports/{batch_id}/confirm', response_model=BatchView)
def confirm(batch_id: uuid.UUID, payload: Confirmation, db: DB, actor: Actor):
    return svc.confirm(db, actor, batch_id, payload.acknowledge_warnings, payload.replace_version)


@router.delete('/imports/{batch_id}')
def discard_batch(batch_id: uuid.UUID, db: DB, actor: Actor):
    if actor.role_code not in {'admin', 'owner'}:
        raise HTTPException(403, '仅老板或管理员可删除导入批次')
    batch = svc.batch_access(db, actor, batch_id)
    return svc.delete_batch(db, batch, actor)


@router.get('/imports/{batch_id}/file')
def original(batch_id: uuid.UUID, db: DB, actor: Actor):
    batch = svc.batch_access(db, actor, batch_id)
    svc.audit(db, actor, 'import_file_download', batch.id)
    db.commit()
    return FileResponse(svc.stored_file(batch), media_type='application/octet-stream', filename=batch.original_filename)


@router.get('/imports/{batch_id}/rows')
def raw_rows(batch_id: uuid.UUID, db: DB, actor: Actor, offset: int = Query(0, ge=0),
             limit: int = Query(50, ge=1, le=100)):
    svc.batch_access(db, actor, batch_id)
    rows = db.scalars(select(RawImportRow).where(RawImportRow.import_batch_id == batch_id)
                      .order_by(RawImportRow.sheet_name, RawImportRow.row_no).offset(offset).limit(limit))
    return [{'sheet': r.sheet_name, 'row': r.row_no, 'status': r.parse_status,
             'error': r.error_message, 'cells': r.raw_data.get('cells', [])} for r in rows]


def scoped_sales(query, db, actor):
    p = services.principal_for(db, actor)
    if p.role in {'owner', 'admin'}:
        return query
    permitted = {p.user_id} if p.role == 'sales' else set()
    if (p.role == 'manager' and p.scope_type == 'team') or (p.role == 'finance' and p.scope_type == 'custom'):
        permitted |= {uuid.UUID(v) for v in p.member_ids}
        if p.role == 'manager':
            permitted.add(p.user_id)
    return query.where(SalesOrder.sales_user_id.in_(permitted))


@router.get('/sales/monthly')
def sales_monthly(db: DB, actor: Actor, source_id: uuid.UUID, date_from: date | None = None, date_to: date | None = None):
    src = svc.source(db, source_id)
    # SQL aggregation over current CORE orders: always fresh after transactional confirmation, never Excel in browser.
    month = func.date_trunc('month', SalesOrder.order_date)
    query = select(month.label('month'), func.count().label('orders'), func.sum(SalesOrder.sales_amount).label('amount'),
                   func.max(SalesOrder.order_date).label('through')).where(SalesOrder.source_system == src.source_code)
    if date_from:
        query = query.where(SalesOrder.order_date >= date_from)
    if date_to:
        query = query.where(SalesOrder.order_date <= date_to)
    rows = db.execute(scoped_sales(query, db, actor).group_by(month).order_by(month)).all()
    return {'metric_code': 'DQ_SALES_RECON', 'label': '源销售金额月度核对（退货/作废口径待确认）',
            'rows': [{'month': r.month.strftime('%Y-%m'), 'orders': r.orders, 'amount': str(r.amount),
                      'through': r.through, 'incomplete_month': r.month.strftime('%Y-%m') == utcnow().astimezone(ZoneInfo('Asia/Shanghai')).strftime('%Y-%m')} for r in rows]}


@router.get('/sales/orders')
def orders(db: DB, actor: Actor, source_id: uuid.UUID, month: str = Query(pattern=r'^\d{4}-\d{2}$'),
           offset: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100)):
    src = svc.source(db, source_id)
    query = select(SalesOrder).where(SalesOrder.source_system == src.source_code,
                                    func.to_char(SalesOrder.order_date, 'YYYY-MM') == month)
    return [{'id': o.id, 'order_no': o.order_no, 'date': o.order_date, 'amount': str(o.sales_amount),
             'version': o.version, 'batch_id': o.last_import_batch_id} for o in db.scalars(
             scoped_sales(query, db, actor).order_by(SalesOrder.order_date, SalesOrder.order_no).offset(offset).limit(limit))]


@router.get('/sales/orders/{order_id}')
def order_detail(order_id: uuid.UUID, db: DB, actor: Actor):
    obj = db.get(SalesOrder, order_id)
    if not obj or not can_read_owned(services.principal_for(db, actor), obj.sales_user_id):
        raise HTTPException(404, '订单不存在或无权访问')
    return {'id': obj.id, 'order_no': obj.order_no, 'amount': str(obj.sales_amount), 'version': obj.version,
            'customer': db.get(Customer, obj.customer_id).customer_name,
            'lines': [{'line_no': x.line_no, 'quantity': str(x.quantity), 'amount': str(x.line_amount)} for x in db.scalars(
                select(SalesOrderLine).where(SalesOrderLine.sales_order_id == obj.id, SalesOrderLine.is_active)
                .order_by(SalesOrderLine.line_no))]}


@router.get('/finance/periods')
def periods(db: DB, actor: Actor, source_id: uuid.UUID):
    if actor.role_code not in {'owner', 'finance', 'admin'}:
        raise HTTPException(403, '无财务期间权限')
    svc.source(db, source_id)
    return [{'id': p.id, 'month': p.period_month, 'is_closed': p.is_closed,
             'profit_batch_id': p.profit_import_batch_id, 'balance_batch_id': p.balance_import_batch_id}
            for p in db.scalars(select(FinancialPeriod).where(FinancialPeriod.data_source_id == source_id)
                                .order_by(FinancialPeriod.period_month))]


@router.patch('/finance/periods/{period_id}')
def close_period(period_id: uuid.UUID, payload: PeriodConfirmation, db: DB, actor: Actor):
    if actor.role_code not in {'admin', 'owner'}:
        raise HTTPException(403, '仅老板或管理员可确认或解除财务期间确认')
    period = db.get(FinancialPeriod, period_id)
    if not period:
        raise HTTPException(404, '期间不存在')
    svc.source(db, period.data_source_id, True)
    db.refresh(period)
    if payload.is_closed and not (period.profit_import_batch_id and period.balance_import_batch_id):
        raise HTTPException(409, '利润表和资产负债表均导入后才能确认期间')
    period.is_closed = payload.is_closed
    period.confirmed_by = actor.id
    period.confirmed_at = utcnow()
    svc.audit(db, actor, 'finance_period_confirm', period.id, {'is_closed': payload.is_closed})
    db.commit()
    return {'is_closed': period.is_closed}


@router.get('/finance/monthly')
def finance_monthly(db: DB, actor: Actor, source_id: uuid.UUID):
    if actor.role_code not in {'owner', 'finance'}:
        raise HTTPException(403, '无财务汇总查看权限')
    svc.source(db, source_id)
    result = []
    for p in db.scalars(select(FinancialPeriod).where(FinancialPeriod.data_source_id == source_id)
                        .order_by(FinancialPeriod.period_month)):
        ids = [x for x in [p.profit_import_batch_id, p.balance_import_batch_id] if x]
        metrics = [{'code': m.metric_code, 'name': m.metric_name, 'type': m.statement_type,
                    'period_value': m.period_value, 'ytd_value': m.ytd_value, 'begin_value': m.begin_value,
                    'end_value': m.end_value, 'batch_id': m.import_batch_id} for m in db.scalars(
                        select(FinancialMetric).where(FinancialMetric.import_batch_id.in_(ids)).order_by(FinancialMetric.metric_code))]
        # Decimal serialized explicitly; JSON numbers would invite binary rounding in clients.
        metrics = [{k: str(v) if isinstance(v, Decimal) else v for k, v in m.items()} for m in metrics]
        def statement_order(metric):
            names = PROFIT_NAMES if metric['type'] == 'profit' else BALANCE_NAMES
            ordinal = next((n for n, (code, _) in names.items() if code == metric['code']), None)
            if ordinal is None:
                ordinal = int(metric['code'].rsplit('_', 1)[-1])
            return (0 if metric['type'] == 'profit' else 1, ordinal)
        metrics.sort(key=statement_order)
        result.append({'month': p.period_month.strftime('%Y-%m'), 'confirmed': p.is_closed, 'metrics': metrics})
    return {'rows': result, 'note': '本月与累计分开；资产对比列为年初，不是上月。未确认版本仅供核对。'}
