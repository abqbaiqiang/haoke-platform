"""Import orchestration, source locking, immutable previews and versioned facts."""
import hashlib
import json
import uuid
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.data_models import (Customer, DataSource, FieldMapping, FinancialMetric, FinancialPeriod,
                             ImportBatch, Product, RawImportRow, SalesOrder, SalesOrderLine)
from app.import_parser import ParseError, Parsed, VERSION, parse, read_book
from app.models import ActivityLog, User, utcnow

FINANCE = {'profit', 'balance_sheet'}


def authorize(user, kind=None, write=False):
    # V1 usage decision (2026-09-10): the company runs with owner + sales accounts only,
    # so the owner performs all day-to-day data-center operations an admin would.
    permitted = user.role_code in {'admin', 'owner'} or (user.role_code == 'finance' and (kind is None or kind in FINANCE))
    if not permitted:
        raise HTTPException(403, '无此数据中心操作权限')


def audit(db, user, event, obj, details=None):
    db.add(ActivityLog(user_id=user.id, activity_type=event, object_type='import_batch', object_id=obj, details=details))


def source(db, source_id, lock=False):
    query = select(DataSource).where(DataSource.id == source_id)
    found = db.scalar(query.with_for_update() if lock else query)
    if not found or not found.is_enabled:
        raise HTTPException(404, '数据源不存在或已停用')
    return found


def stored_file(batch):
    root = Path(get_settings().upload_root).resolve()
    path = (root / batch.storage_path).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(409, '原件不存在或存储路径无效')
    return path


def batch_access(db, user, batch_id, lock=False):
    query = select(ImportBatch).where(ImportBatch.id == batch_id)
    batch = db.scalar(query.with_for_update() if lock else query)
    if not batch or (user.role_code == 'finance' and batch.business_type not in FINANCE):
        raise HTTPException(404, '批次不存在或无权访问')
    authorize(user, batch.business_type)
    return batch


def digest_record(record):
    def clean(value):
        if isinstance(value, dict):
            return {k: clean(v) for k, v in value.items() if k != 'row'}
        if isinstance(value, list):
            return [clean(v) for v in value]
        return value
    return hashlib.sha256(json.dumps(clean(record), sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def finance_preview(db, user, batch_id):
    batch = batch_access(db, user, batch_id)
    if batch.business_type not in FINANCE:
        raise HTTPException(404, '该批次不是财务报表')
    if batch.status == 'failed' or not batch.normalized_data.get('period'):
        raise HTTPException(409, '预检未通过，无法提供完整财务预览；请查看错误行')
    amount_fields = {'period_value', 'ytd_value', 'begin_value', 'end_value'}
    records = [{key: format(Decimal(value), '.2f') if key in amount_fields and value is not None else value
                for key, value in record.items()} for record in batch.normalized_data['records']]
    return {'batch_id': batch.id, 'filename': batch.original_filename, 'status': batch.status,
            'statement_type': batch.business_type, 'entity_name': batch.normalized_data['entity_name'],
            'period': batch.normalized_data['period'], 'blank_as_zero': bool(batch.options.get('blank_as_zero')),
            'requires_blank_confirmation': bool(batch.preview['summary'].get('requires_blank_confirmation')),
            'warnings': batch.preview.get('warnings', []), 'records': records}


def reference_errors(db, src, result):
    customers = {x.customer_code for x in db.scalars(select(Customer).where(Customer.source_system == src.source_code))}
    products = {x.product_code for x in db.scalars(select(Product).where(Product.source_system == src.source_code))}
    for record in result.data['records']:
        if record['customer_code'] not in customers:
            result.errors.append({'row': record['row'], 'field': '客户编码', 'message': '客户档案未导入或编码不存在'})
        for line in record['lines']:
            if line['product_code'] not in products:
                result.errors.append({'row': line['row'], 'field': '商品编码', 'message': '商品档案未导入或编码不存在'})


def upload(db: Session, user, source_id, kind, filename, data, options):
    authorize(user, kind, True)
    src = source(db, source_id, True)
    suffix = Path(filename).suffix.lower()
    if (not filename or len(filename) > 255 or any(c in filename for c in '/\\\x00\r\n')
            or suffix not in {'.csv', '.xls', '.xlsx'}):
        raise HTTPException(422, '文件名或类型无效')
    if not data or len(data) > get_settings().import_max_bytes:
        raise HTTPException(413, '文件为空或超出大小限制')
    batch = ImportBatch(id=uuid.uuid4(), data_source_id=src.id, business_type=kind,
                        original_filename=filename, file_hash=hashlib.sha256(data).hexdigest(),
                        imported_by=user.id, options=options, storage_path='')
    batch.storage_path = f'{src.id}/{batch.id}{suffix}'
    root = Path(get_settings().upload_root).resolve()
    target = root / batch.storage_path
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('xb') as f:
        f.write(data)
    result = Parsed()
    try:
        result = parse(data, filename, kind, options.get('mapping'), options.get('blank_as_zero', False))
        if kind == 'sales' and not result.errors:
            reference_errors(db, src, result)
        if kind in FINANCE and result.data.get('entity_name') != src.entity_name:
            result.errors.append({'row': 2, 'field': '编制单位', 'message': '编制单位与数据源主体不一致'})
    except ParseError as exc:
        result.errors.append({'row': exc.row, 'field': exc.field, 'message': str(exc)})
        try:
            for sheet, rows in read_book(data, filename):
                result.raw.extend({'sheet_name': sheet, 'row_no': i, 'raw_data': {'cells': [
                    v.isoformat() if isinstance(v, (datetime, date)) else v for v in row]},
                    'parse_status': 'error' if i == exc.row else 'ignored'} for i, row in enumerate(rows, 1))
        except ParseError:
            pass
    old = db.scalar(select(ImportBatch).where(ImportBatch.data_source_id == src.id,
                    ImportBatch.business_type == kind, ImportBatch.file_hash == batch.file_hash,
                    ImportBatch.status == 'success').order_by(ImportBatch.started_at.desc()).limit(1))
    if old:
        batch.duplicate_of = old.id
        result.warnings.append('相同文件曾成功导入；确认时仍检查当前事实，不重复计数。')
    staff = src.config_json.get('staff', {})
    if kind in {'sales', 'customer'}:
        missing = sum(not staff.get(r.get('salesperson', '')) for r in result.data['records'])
        if missing:
            result.warnings.append(f'{missing} 条记录的销售人员未映射，保留未分配，不自动归属当前账号。')
    result.summary.pop('business_rows', None)
    batch.preview = {'summary': result.summary, 'errors': result.errors, 'warnings': result.warnings,
                     'mapping': result.mapping, 'parser_version': VERSION}
    batch.normalized_data = result.data
    batch.total_rows = len(result.raw)
    batch.error_rows = len({e['row'] for e in result.errors})
    batch.status = 'failed' if result.errors else 'pending'
    batch.error_summary = '预检未通过' if result.errors else None
    batch.date_from = date.fromisoformat(result.summary['date_from']) if result.summary.get('date_from') else None
    batch.date_to = date.fromisoformat(result.summary['date_to']) if result.summary.get('date_to') else None
    batch.options = {**options, 'staff': staff}
    # Persist a separate immutable mapping version for reproducibility.
    mapping = FieldMapping(data_source_id=src.id, business_type=kind,
                           version=(db.scalar(select(FieldMapping.version).where(FieldMapping.data_source_id == src.id,
                           FieldMapping.business_type == kind).order_by(FieldMapping.version.desc()).limit(1)) or 0)+1,
                           specification=result.mapping)
    db.add(mapping)
    db.flush()
    batch.mapping_id = mapping.id
    db.add(batch)
    db.flush()
    errors = {e['row']: e['message'] for e in result.errors}
    for row in result.raw:
        if row['row_no'] in errors:
            row.update(parse_status='error', error_message=errors[row['row_no']])
        db.add(RawImportRow(import_batch_id=batch.id, **row))
    audit(db, user, 'import_precheck', batch.id, {'type': kind, 'status': batch.status})
    db.commit()
    return batch


def confirm(db, user, batch_id, acknowledge_warnings, replace_version):
    batch = batch_access(db, user, batch_id)
    authorize(user, batch.business_type, True)
    # Always lock source first, then batch. Serializes all facts within a source and avoids deadlocks.
    src = source(db, batch.data_source_id, True)
    batch = batch_access(db, user, batch_id, True)
    db.refresh(batch)
    if batch.status == 'success':
        return batch
    if batch.status != 'pending' or batch.preview.get('errors'):
        raise HTTPException(409, '预检未通过，请修正后重新上传')
    if batch.preview.get('warnings') and not acknowledge_warnings:
        raise HTTPException(409, '请先阅读并确认预检提示')
    if batch.preview['summary'].get('requires_blank_confirmation'):
        raise HTTPException(409, '财务空白策略未确认，请选择空白策略后重新预检')
    if hashlib.sha256(stored_file(batch).read_bytes()).hexdigest() != batch.file_hash:
        raise HTTPException(409, '原件校验失败，请重新上传')
    if batch.options.get('staff', {}) != src.config_json.get('staff', {}):
        raise HTTPException(409, '人员映射已变化，请重新预检')
    for value in batch.options.get('staff', {}).values():
        account = db.get(User, uuid.UUID(value))
        if not account or not account.is_active:
            raise HTTPException(409, '映射账号已停用，请更新映射后重新预检')
    if batch.business_type == 'sales':
        check = Parsed(data=batch.normalized_data)
        reference_errors(db, src, check)
        if check.errors:
            raise HTTPException(409, '关联档案发生变化，请重新预检')
    try:
        with db.begin_nested():
            records = batch.normalized_data['records']
            counts = {'inserted': 0, 'updated': 0, 'unchanged': 0}
            if batch.business_type in {'customer', 'product'}:
                apply_master(db, batch, src, counts)
            elif batch.business_type == 'sales':
                apply_sales(db, batch, src, counts)
            else:
                apply_finance(db, batch, src, counts, replace_version)
            batch.status = 'success'
            batch.success_rows = batch.preview['summary'].get('business_rows_count', len(records))
            batch.finished_at = src.last_success_at = utcnow()
            batch.preview = {**batch.preview, 'result': counts}
            audit(db, user, 'import_confirm', batch.id, counts)
            db.flush()
        db.commit()
    except HTTPException:
        # Failed attempts leave the immutable preview pending and all facts unchanged.
        audit(db, user, 'import_confirm_rejected', batch.id)
        db.commit()
        raise
    return batch


def mapped_staff(batch, name):
    value = batch.options.get('staff', {}).get(name)
    return uuid.UUID(value) if value else None


def apply_master(db, batch, src, counts):
    customer = batch.business_type == 'customer'
    model, key = (Customer, 'customer_code') if customer else (Product, 'product_code')
    existing = {getattr(x, key): x for x in db.scalars(select(model).where(model.source_system == src.source_code)
                .order_by(model.id).with_for_update().execution_options(populate_existing=True))}
    for r in batch.normalized_data['records']:
        obj = existing.get(r['code'])
        if obj is None:
            obj = model(source_system=src.source_code, **{key: r['code']})
            db.add(obj)
            counts['inserted'] += 1
        else:
            if digest_record(obj.source_fields) == digest_record(r) and (not customer or obj.crm_managed or obj.owner_user_id == mapped_staff(batch, r.get('salesperson', ''))):
                counts['unchanged'] += 1
                continue
            previous = db.get(ImportBatch, obj.last_import_batch_id)
            if previous.started_at > batch.started_at:
                raise HTTPException(409, '主档已有更新批次，请重新预检')
            counts['updated'] += 1
        if customer:
            obj.customer_name = r['name']
            obj.normalized_name = ''.join(r['name'].split())
            if not obj.crm_managed:
                obj.owner_user_id = mapped_staff(batch, r.get('salesperson', ''))
                obj.ownership_status = 'owned' if obj.owner_user_id else 'unassigned'
        else:
            obj.product_name = r['name']
        obj.source_fields = r
        obj.last_import_batch_id = batch.id


def apply_sales(db, batch, src, counts):
    customers = {x.customer_code: x.id for x in db.scalars(select(Customer).where(Customer.source_system == src.source_code))}
    products = {x.product_code: x.id for x in db.scalars(select(Product).where(Product.source_system == src.source_code))}
    existing = {x.order_no: x for x in db.scalars(select(SalesOrder).where(SalesOrder.source_system == src.source_code))}
    for r in batch.normalized_data['records']:
        obj = existing.get(r['order_no'])
        content_hash = digest_record({**r, '_mapped_user': str(mapped_staff(batch, r.get('salesperson', '')))})
        stamp = datetime.fromisoformat(r['source_updated_at']) if r['source_updated_at'] else None
        if obj and obj.content_hash == content_hash:
            counts['unchanged'] += 1
            continue
        if obj:
            if obj.source_updated_at and (stamp is None or stamp <= obj.source_updated_at):
                raise HTTPException(409, '存在旧版本或同时间冲突订单，未覆盖当前事实；请重新导出核对')
            # No source timestamp: a second changed snapshot requires explicit review, not silent ordering.
            if not stamp and not obj.source_updated_at:
                raise HTTPException(409, '变更订单缺少源修改时间，无法安全确定版本顺序')
            obj.version += 1
            db.execute(update(SalesOrderLine).where(SalesOrderLine.sales_order_id == obj.id).values(is_active=False))
            counts['updated'] += 1
        else:
            obj = SalesOrder(source_system=src.source_code, order_no=r['order_no'], version=1)
            db.add(obj)
            counts['inserted'] += 1
        obj.order_date = date.fromisoformat(r['order_date'])
        obj.customer_id = customers[r['customer_code']]
        obj.sales_user_id = mapped_staff(batch, r.get('salesperson', ''))
        for name in ['sales_amount', 'discount_amount', 'net_amount', 'received_amount']:
            setattr(obj, name, Decimal(r[name]) if r.get(name) is not None else None)
        obj.payment_status = {'未收款': 'unpaid', '部分收款': 'partial', '全部收款': 'paid'}.get(r['payment_status'], 'unknown')
        obj.source_updated_at, obj.content_hash = stamp, content_hash
        obj.last_import_batch_id = batch.id
        db.flush()
        for no, line in enumerate(r['lines'], 1):
            db.add(SalesOrderLine(sales_order_id=obj.id, version=obj.version, line_no=no,
                                 product_id=products[line['product_code']], quantity=Decimal(line['quantity']),
                                 unit_price=Decimal(line['unit_price']) if line['unit_price'] is not None else None,
                                 unit_name=line['unit_name'], warehouse_name=line['warehouse_name'],
                                 line_amount=Decimal(line['line_amount']), last_import_batch_id=batch.id))


def apply_finance(db, batch, src, counts, replace_version):
    month = date.fromisoformat(batch.normalized_data['period'])
    period = db.scalar(select(FinancialPeriod).where(FinancialPeriod.data_source_id == src.id,
                      FinancialPeriod.period_month == month))
    if period is None:
        period = FinancialPeriod(data_source_id=src.id, period_month=month)
        db.add(period)
    attr = 'profit_import_batch_id' if batch.business_type == 'profit' else 'balance_import_batch_id'
    active_id = getattr(period, attr)
    if active_id:
        old = db.get(ImportBatch, active_id)
        if old.file_hash == batch.file_hash and old.options.get('blank_as_zero') == batch.options.get('blank_as_zero'):
            counts['unchanged'] += len(batch.normalized_data['records'])
            return
        if period.is_closed or not replace_version:
            raise HTTPException(409, '该月份已有有效报表；已确认月份须先解除确认，再明确选择替换版本')
    for r in batch.normalized_data['records']:
        values = {k: Decimal(r[k]) if r[k] is not None else None for k in ['period_value', 'ytd_value', 'begin_value', 'end_value']}
        db.add(FinancialMetric(period_month=month, statement_type=batch.business_type, metric_code=r['metric_code'],
                               metric_name=r['metric_name'], import_batch_id=batch.id, **values))
    setattr(period, attr, batch.id)
    counts['updated' if active_id else 'inserted'] += len(batch.normalized_data['records'])
