"""客户口径统一（docs/32 §2/§3，老板 2026-09-18 拍板）。

- 删列 customer.customer_status（三套客户状态并存的冲突源；历史值为测试数据，老板授权清除，
  不迁移不保留）。客户页标签改由"合作状态 + 开放项目阶段 + 成交事实"推导。
- 新增 customer.company_address 公司地址（需求文档四：客户信息字段增加公司地址）。
"""
from alembic import op

revision = '0013_customer_caliber'
down_revision = '0012_followup_attachment'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE customer DROP COLUMN IF EXISTS customer_status")
    op.execute("ALTER TABLE customer ADD COLUMN IF NOT EXISTS company_address VARCHAR(255)")


def downgrade():
    # customer_status 按拍板不恢复（历史数据已清除）；仅回滚地址列。
    op.execute("ALTER TABLE customer DROP COLUMN IF EXISTS company_address")
