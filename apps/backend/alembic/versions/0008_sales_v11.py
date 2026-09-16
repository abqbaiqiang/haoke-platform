"""V1.1 sales workspace: followup effectiveness flag and customer sales status."""
from alembic import op

revision = '0008_v11'
down_revision = '0007_m5'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE crm_followup ADD COLUMN is_effective BOOLEAN")
    op.execute("ALTER TABLE customer ADD COLUMN customer_status VARCHAR(24)")
    op.execute("ALTER TABLE customer ADD CONSTRAINT ck_customer_status "
               "CHECK (customer_status IN ('potential', 'contacted', 'demand', 'quoted', 'won', 'dormant'))")


def downgrade():
    op.execute("ALTER TABLE customer DROP CONSTRAINT IF EXISTS ck_customer_status")
    op.execute("ALTER TABLE customer DROP COLUMN IF EXISTS customer_status")
    op.execute("ALTER TABLE crm_followup DROP COLUMN IF EXISTS is_effective")
