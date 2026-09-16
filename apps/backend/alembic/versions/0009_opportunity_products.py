"""V1.1 opportunity products: link opportunities to recommended products."""
from alembic import op

revision = '0009_opp_prod'
down_revision = '0008_v11'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE TABLE crm_opportunity_product (
        opportunity_id UUID NOT NULL REFERENCES crm_opportunity(id),
        product_id UUID NOT NULL REFERENCES product(id),
        created_by UUID NOT NULL REFERENCES sys_user(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (opportunity_id, product_id))""")
    op.execute("CREATE INDEX ix_crm_opportunity_product_product_id ON crm_opportunity_product (product_id)")


def downgrade():
    op.execute("DROP TABLE IF EXISTS crm_opportunity_product")
