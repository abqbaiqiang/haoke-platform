"""BI 口径层：销售核实覆盖判断与单据金额/有效性的统一口径（docs/29 C4 拆分）。"""

from app import bi_schemas as dto
from app.bi_access import latest_fact
from app.bi_calculations import ZERO
from app.bi_models import SalesReview


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
