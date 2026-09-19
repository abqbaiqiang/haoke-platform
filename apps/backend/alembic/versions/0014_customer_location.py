"""客户位置管理（Web 端客户位置功能开发文档 V1.0）。

Customer 增加统一位置字段：Web 与未来微信小程序读写同一份位置数据（单一数据源，
禁止第二套坐标表）。历史客户全部默认 latitude/longitude = NULL、location_status = 'unset'，
向后兼容，不要求历史客户立刻设置位置。
"""
from alembic import op

revision = '0014_customer_location'
down_revision = '0013_customer_caliber'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE customer ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION")
    op.execute("ALTER TABLE customer ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION")
    op.execute("ALTER TABLE customer ADD COLUMN IF NOT EXISTS coordinate_system VARCHAR(20)")
    op.execute("ALTER TABLE customer ADD COLUMN IF NOT EXISTS location_status VARCHAR(30) NOT NULL DEFAULT 'unset'")
    op.execute("ALTER TABLE customer ADD COLUMN IF NOT EXISTS location_source VARCHAR(30)")
    op.execute("ALTER TABLE customer ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE customer ADD COLUMN IF NOT EXISTS location_updated_by UUID REFERENCES sys_user(id)")


def downgrade():
    op.execute("ALTER TABLE customer DROP COLUMN IF EXISTS location_updated_by")
    op.execute("ALTER TABLE customer DROP COLUMN IF EXISTS location_updated_at")
    op.execute("ALTER TABLE customer DROP COLUMN IF EXISTS location_source")
    op.execute("ALTER TABLE customer DROP COLUMN IF EXISTS location_status")
    op.execute("ALTER TABLE customer DROP COLUMN IF EXISTS coordinate_system")
    op.execute("ALTER TABLE customer DROP COLUMN IF EXISTS longitude")
    op.execute("ALTER TABLE customer DROP COLUMN IF EXISTS latitude")
