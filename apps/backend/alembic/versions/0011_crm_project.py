"""Project master (crm_project) + opportunity milestone dates/delivery ratio; stage enum widened.

docs/31 第 1 期（老板 2026-09-17 拍板）：
- 新增项目主档 crm_project（项目名称自由填写、无唯一性约束；一个项目可对应多家客户）。
- crm_opportunity 增加所属项目与里程碑计划日期、交付比例列；表名保留，业务名叫“项目”。
- 存量商机数据清空重录（仅项目/商机两类；客户、销售、财务、跟进、待办一律不动）。
  待办对商机的引用置空以保持外键一致；操作留痕（activity_log）不受影响。
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '0011_crm_project'
down_revision = '0010_opp_workbench'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'crm_project',
        sa.Column('id', UUID(), primary_key=True),
        sa.Column('project_name', sa.String(255), nullable=False),
        sa.Column('project_type', sa.String(32)),
        sa.Column('owner_user_id', UUID(), sa.ForeignKey('sys_user.id'), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='active'),
        sa.Column('remark', sa.Text()),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_crm_project_project_name', 'crm_project', ['project_name'])
    op.create_index('ix_crm_project_owner_user_id', 'crm_project', ['owner_user_id'])
    for column in ['project_id', 'planned_contact_date', 'planned_recommend_date', 'planned_selection_date',
                   'planned_bidding_date', 'planned_negotiation_date', 'planned_delivery_date', 'delivery_ratio']:
        op.execute(f"ALTER TABLE crm_opportunity ADD COLUMN {column} "
                   + ("UUID REFERENCES crm_project(id)" if column == 'project_id'
                      else "NUMERIC(5,2)" if column == 'delivery_ratio' else "DATE"))
    op.create_index('ix_crm_opportunity_project_id', 'crm_opportunity', ['project_id'])
    # 存量清空（老板确认开发阶段可删；范围仅项目/商机）。
    op.execute("UPDATE crm_task SET opportunity_id = NULL WHERE opportunity_id IS NOT NULL")
    op.execute("DELETE FROM crm_opportunity_product")
    op.execute("DELETE FROM crm_opportunity")


def downgrade():
    # 里程碑列与清空的商机数据不可恢复（清空重录为拍板决策）。
    op.drop_index('ix_crm_opportunity_project_id', table_name='crm_opportunity')
    op.execute("ALTER TABLE crm_opportunity DROP COLUMN delivery_ratio")
    for column in ['planned_delivery_date', 'planned_negotiation_date', 'planned_bidding_date',
                   'planned_selection_date', 'planned_recommend_date', 'planned_contact_date', 'project_id']:
        op.execute(f"ALTER TABLE crm_opportunity DROP COLUMN {column}")
    op.drop_index('ix_crm_project_project_name', table_name='crm_project')
    op.drop_index('ix_crm_project_owner_user_id', table_name='crm_project')
    op.drop_table('crm_project')
