"""BI 门面：保持既有 ``bi_service`` 公开面不变（docs/29 C4 拆分）。

C4 拆分结果：
- 装载层（权限/配置/目标/数据源/订单加载）→ :mod:`app.bi_access`
- 口径层（核实覆盖/单据金额与有效性）→ :mod:`app.bi_caliber`
- 指标层（销售分析/工作台/客户关注/画像/总览）→ :mod:`app.bi_insights`
- DTO 即 :mod:`app.bi_schemas`

本文件仅 re-export 全部既有公开名，``app.bi_api``、``app.sales_workspace``
与测试的 ``svc.*`` / ``bi.*`` 调用面保持不变。
"""
from app import bi_schemas as dto
from app.bi_access import TZ, audit, get_target, latest_fact, load_orders, month, people, person, require, \
    save_review, save_settings, save_target, scope, settings, source, sources
from app.bi_caliber import included, normal_sale, order_value, review_ready
from app.bi_calculations import ZERO, metric, money, month_end, month_start, ratio, shift_month, target_metrics, work_dates
from app.bi_insights import CONVERT_BUCKETS, RFM_SEGMENTS, analysis, attention, customer_analytics, customer_profile, \
    orders, overview, workbench
from app.bi_models import SalesReview
from app.data_models import DataSource, SalesOrder
from app.models import utcnow

__all__ = [
    'dto', 'TZ', 'audit', 'get_target', 'latest_fact', 'load_orders', 'month', 'people', 'person', 'require',
    'save_review', 'save_settings', 'save_target', 'scope', 'settings', 'source', 'sources',
    'included', 'normal_sale', 'order_value', 'review_ready',
    'ZERO', 'metric', 'money', 'month_end', 'month_start', 'ratio', 'shift_month', 'target_metrics', 'work_dates',
    'RFM_SEGMENTS', 'CONVERT_BUCKETS', 'analysis', 'attention', 'customer_analytics', 'customer_profile',
    'orders', 'overview', 'workbench',
    'SalesReview', 'DataSource', 'SalesOrder', 'utcnow',
]
