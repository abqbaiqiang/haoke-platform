"""Deterministic M3 metric primitives. Money never passes through float."""
import json
from pathlib import Path
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from app.bi_schemas import Metric, Settings

ZERO = Decimal('0')
CATALOG = json.loads(Path(__file__).with_name('bi_metric_catalog.json').read_text(encoding='utf-8'))


def money(value):
    return None if value is None else str(Decimal(value).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


def month_start(value):
    return value.replace(day=1)


def shift_month(value, count):
    year, month = divmod(value.year * 12 + value.month - 1 + count, 12)
    return date(year, month + 1, 1)


def month_end(value):
    return value.replace(day=monthrange(value.year, value.month)[1])


def work_dates(month: date, user_id, config: Settings):
    personal = config.personal_calendar.get(user_id, {})
    days = [month_start(month) + timedelta(days=i) for i in range(monthrange(month.year, month.month)[1])]
    return [d for d in days if personal.get(d, config.calendar.get(d, d.weekday() in config.work_week))]


def metric(code, label, value, unit='元', reason=None):
    return Metric(code=code, label=label, value=money(value) if unit in {'元', '%', '百分点'} else
                  (str(value) if value is not None else None), unit=unit, reason=reason if value is None else None, **CATALOG.get(code, {}))


def ratio(numerator, denominator):
    return None if numerator is None or not denominator else Decimal(numerator) / Decimal(denominator)


def target_metrics(amount, actual, days, today, weighted, month):
    elapsed = sum(d <= today for d in days)
    remaining_days = len(days) - elapsed
    completion = ratio(actual, amount)
    progress = ratio(elapsed, len(days))
    remaining = None if amount is None or amount == 0 or actual is None else max(amount - actual, ZERO)
    forecast = None if actual is None or not elapsed else actual / Decimal(elapsed) * len(days)
    # Historical months cannot reconstruct the historical opportunity pipeline from current open records.
    weighted_forecast = actual + weighted if actual is not None and weighted is not None and month == month_start(today) else None
    return [
        metric('TGT_MONTH_AMT', '月销售目标', amount if amount else None, reason='目标未设置'),
        metric('EXEC_SALES_AMT', '已确认经营销售额', actual, reason='销售口径、覆盖或人员映射待确认'),
        metric('TGT_COMPLETION', '目标完成率', completion * 100 if completion is not None else None, '%', '目标未设置或销售待核实'),
        metric('TGT_TIME_PROGRESS', '工作日时间进度', progress * 100 if progress is not None else None, '%', '本月无计划工作日'),
        metric('TGT_PROGRESS_GAP', '目标进度差', (completion-progress)*100 if completion is not None and progress is not None else None,
               '百分点', '目标或销售数据不可用'),
        metric('TGT_REMAINING', '剩余目标', remaining, reason='目标未设置或销售待核实'),
        metric('TGT_DAILY_REQUIRED', '剩余工作日日均需完成', ratio(remaining, remaining_days), reason='无剩余工作日或目标/销售不可用'),
        metric('TGT_RUNRATE_FORECAST', '月底节奏预测', forecast, reason='无已过工作日或销售待核实'),
        metric('TGT_WEIGHTED_FORECAST', '月底商机加权预测', weighted_forecast, reason='仅当前月可用，需完整销售及商机金额/概率'),
        metric('TGT_WORKDAYS_REMAINING', '剩余工作日', remaining_days, '天'),
    ]
