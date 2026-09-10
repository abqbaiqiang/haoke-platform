"""M3 additive targets and audited analysis configuration."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

revision = '0005_m3'
down_revision = '0004_m2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('sales_target',
        sa.Column('id', pg.UUID(), primary_key=True),
        sa.Column('user_id', pg.UUID(), sa.ForeignKey('sys_user.id'), nullable=False),
        sa.Column('period_month', sa.Date(), nullable=False),
        sa.Column('sales_amount_target', sa.Numeric(18, 2), nullable=False),
        sa.Column('remark', sa.String(255)),
        sa.Column('created_by', pg.UUID(), sa.ForeignKey('sys_user.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('user_id', 'period_month'),
        sa.CheckConstraint('sales_amount_target >= 0', name='ck_target_amount'),
        sa.CheckConstraint('EXTRACT(DAY FROM period_month) = 1', name='ck_target_month'))
    op.create_table('bi_setting', sa.Column('id', sa.Integer(), primary_key=True),
                    sa.Column('value', pg.JSONB(), nullable=False))
    op.create_table('sales_review',
        sa.Column('source_id', pg.UUID(), sa.ForeignKey('data_source.id'), primary_key=True),
        sa.Column('value', pg.JSONB(), nullable=False),
        sa.Column('facts_updated_at', sa.DateTime(timezone=True)),
        sa.Column('reviewed_by', pg.UUID(), sa.ForeignKey('sys_user.id'), nullable=False),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=False))


def downgrade():
    for table in ['sales_target', 'bi_setting', 'sales_review']:
        if op.get_bind().scalar(sa.text(f'SELECT count(*) FROM {table}')):
            raise RuntimeError('M3 planning/history exists; restore a verified backup instead of discarding it')
    op.drop_table('sales_review')
    op.drop_table('bi_setting')
    op.drop_table('sales_target')
