"""Customer workbench: opportunity blocker and next promotion fields (docs/29 客户详情页拆解说明)."""
from alembic import op

revision = '0010_opp_workbench'
down_revision = '0009_opp_prod'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE crm_opportunity ADD COLUMN current_blocker VARCHAR(255)")
    op.execute("ALTER TABLE crm_opportunity ADD COLUMN next_promotion VARCHAR(500)")


def downgrade():
    op.execute("ALTER TABLE crm_opportunity DROP COLUMN next_promotion")
    op.execute("ALTER TABLE crm_opportunity DROP COLUMN current_blocker")
