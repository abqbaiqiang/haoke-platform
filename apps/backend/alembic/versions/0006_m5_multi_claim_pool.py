"""M5 additive multi-claim pool: customer_claim table and imported customers backfilled to the pool."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

revision = '0006_m5'
down_revision = '0005_m3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('customer_claim',
        sa.Column('id', pg.UUID(), primary_key=True),
        sa.Column('customer_id', pg.UUID(), sa.ForeignKey('customer.id'), nullable=False),
        sa.Column('user_id', pg.UUID(), sa.ForeignKey('sys_user.id'), nullable=False),
        sa.Column('claimed_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('customer_id', 'user_id', name='uq_customer_claim_once'))
    op.execute('CREATE INDEX ix_customer_claim_customer_id ON customer_claim (customer_id)')
    op.execute('CREATE INDEX ix_customer_claim_user_id ON customer_claim (user_id)')
    # Imported (non-CRM-managed) customers become claimable in the pool; a mapped
    # primary owner is preserved. CRM-managed customers keep their current status.
    op.execute("""
        UPDATE customer
        SET ownership_status = 'public_pool',
            public_pool_entered_at = COALESCE(public_pool_entered_at, NOW())
        WHERE source_system <> 'crm' AND crm_managed = FALSE
          AND ownership_status <> 'public_pool'
    """)


def downgrade():
    if op.get_bind().scalar(sa.text('SELECT count(*) FROM customer_claim')):
        raise RuntimeError('认养记录已存在；请先导出并核对历史，不要直接丢弃')
    op.drop_table('customer_claim')
    # Best-effort inverse of the pool backfill.
    op.execute("""
        UPDATE customer
        SET ownership_status = CASE WHEN owner_user_id IS NULL THEN 'unassigned' ELSE 'owned' END,
            public_pool_entered_at = NULL
        WHERE source_system <> 'crm' AND crm_managed = FALSE AND ownership_status = 'public_pool'
    """)
