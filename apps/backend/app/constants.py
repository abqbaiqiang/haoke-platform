"""Backend-shared string constants（审计 P3-08 收敛点）：角色、客户归属状态、客户等级、目标类型。

只收敛跨模块比较/校验用的字面量；Pydantic `Literal[...]` 与数据库 CheckConstraint
内的字面量为契约定义，保留原样。指标码的唯一登记处是 `bi_metric_catalog.json`
（tests/test_m3.py 双向断言护栏），此处不再并行维护指标码常量以免双源。
"""

# ---- 角色编码（users.role_code / permissions.Principal.role）----
ROLE_OWNER = 'owner'
ROLE_ADMIN = 'admin'
ROLE_MANAGER = 'manager'
ROLE_SALES = 'sales'
ROLE_FINANCE = 'finance'

# ---- 高频角色组合 ----
# 系统与业务全部数据可见/可管（admin=最高权限，2026-09-16 决策）。
FULL_ACCESS_ROLES = {ROLE_OWNER, ROLE_ADMIN}
# 一线执行角色：销售员 + 经理。
SALES_ACTOR_ROLES = {ROLE_SALES, ROLE_MANAGER}
# 除财务外的全部业务角色。
ALL_WORK_ROLES = {ROLE_OWNER, ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES}

# ---- 客户归属状态（customers.ownership_status）----
OWNERSHIP_OWNED = 'owned'
OWNERSHIP_PUBLIC_POOL = 'public_pool'

# ---- 客户等级（customers.customer_level，CRM 分层口径见 docs/03/04）----
CUSTOMER_LEVELS = ('A', 'B', 'C', 'D')

# ---- 销售目标类型（sales_target.target_type）----
TARGET_MONTHLY = 'monthly'
TARGET_QUARTERLY = 'quarterly'
