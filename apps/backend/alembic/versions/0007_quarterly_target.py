"""M5 quarterly sales targets: target_type column on sales_target."""
from alembic import op

revision = '0007_m5'
down_revision = '0006_m5'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE sales_target ADD COLUMN target_type VARCHAR(16) NOT NULL DEFAULT 'monthly'")
    op.execute("ALTER TABLE sales_target ADD CONSTRAINT ck_target_type CHECK (target_type IN ('monthly', 'quarterly'))")
    op.execute("ALTER TABLE sales_target DROP CONSTRAINT IF EXISTS sales_target_user_id_period_month_key")
    op.execute("ALTER TABLE sales_target ADD CONSTRAINT uq_target_user_period_type UNIQUE (user_id, period_month, target_type)")


def downgrade():
    # Monthly rows are preserved; quarterly targets would violate the restored unique key, so they are removed.
    op.execute("DELETE FROM sales_target WHERE target_type <> 'monthly'")
    op.execute("ALTER TABLE sales_target DROP CONSTRAINT IF EXISTS uq_target_user_period_type")
    op.execute("ALTER TABLE sales_target ADD CONSTRAINT sales_target_user_id_period_month_key UNIQUE (user_id, period_month)")
    op.execute("ALTER TABLE sales_target DROP CONSTRAINT IF EXISTS ck_target_type")
    op.execute("ALTER TABLE sales_target DROP COLUMN target_type")
