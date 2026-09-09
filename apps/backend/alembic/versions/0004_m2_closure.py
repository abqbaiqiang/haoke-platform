"""Record opportunity closure timestamps without rewriting CRM history."""
from alembic import op
import sqlalchemy as sa

revision = "0004_m2"
down_revision = "0003_m2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("crm_opportunity", sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True))
    # Existing closed records have no verified closure time; leave them unknown.


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM crm_opportunity WHERE closed_at IS NOT NULL")):
        raise RuntimeError("Closure history exists; restore a verified backup instead of discarding history")
    op.drop_column("crm_opportunity", "closed_at")
