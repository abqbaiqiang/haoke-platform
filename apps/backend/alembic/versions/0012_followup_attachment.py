"""跟进图片附件表（docs/32 阶段②）。

销售端快速记录跟进支持粘贴图片（老板拍板：只做粘贴、不做文件上传）。
纯增量迁移：新增 crm_followup_attachment，既有表不动。
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '0012_followup_attachment'
down_revision = '0011_crm_project'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'crm_followup_attachment',
        sa.Column('id', UUID(), primary_key=True),
        sa.Column('followup_id', UUID(), sa.ForeignKey('crm_followup.id'), nullable=False, index=True),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('content_type', sa.String(100), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('sha256', sa.String(64), nullable=False),
        sa.Column('storage_path', sa.Text(), nullable=False),
        sa.Column('created_by', UUID(), sa.ForeignKey('sys_user.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade():
    op.drop_table('crm_followup_attachment')
