"""M2 additive CRM tables; preserves ERP keys and source rows.
Downgrade is only safe before CRM data is entered.
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_m2"
down_revision = "0002_m1"
branch_labels = None
depends_on = None

def upgrade():
    op.execute('ALTER TABLE customer ALTER COLUMN customer_code DROP NOT NULL')
    op.execute('ALTER TABLE customer ALTER COLUMN last_import_batch_id DROP NOT NULL')
    op.execute("ALTER TABLE customer ADD COLUMN ownership_status VARCHAR(24) DEFAULT 'unassigned' NOT NULL")
    op.execute('ALTER TABLE customer ADD COLUMN customer_type VARCHAR(32)')
    op.execute('ALTER TABLE customer ADD COLUMN customer_level VARCHAR(16)')
    op.execute("ALTER TABLE customer ADD COLUMN lifecycle_status VARCHAR(24) DEFAULT 'prospect' NOT NULL")
    op.execute('ALTER TABLE customer ADD COLUMN remark TEXT')
    op.execute('ALTER TABLE customer ADD COLUMN public_pool_entered_at TIMESTAMP WITH TIME ZONE')
    op.execute('ALTER TABLE customer ADD COLUMN bound_at TIMESTAMP WITH TIME ZONE')
    op.execute('ALTER TABLE customer ADD COLUMN bound_customer_id UUID')
    op.execute("ALTER TABLE customer ADD COLUMN crm_managed BOOLEAN DEFAULT 'false' NOT NULL")
    op.execute('ALTER TABLE customer ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL')
    op.execute('ALTER TABLE customer ADD CONSTRAINT uq_customer_bound UNIQUE (bound_customer_id)')
    op.execute('ALTER TABLE customer ADD CONSTRAINT fk_customer_bound FOREIGN KEY (bound_customer_id) REFERENCES customer(id)')
    op.execute("UPDATE customer SET ownership_status = CASE WHEN owner_user_id IS NULL THEN 'unassigned' ELSE 'owned' END")
    op.execute('\nCREATE TABLE crm_setting (\n\tid SERIAL NOT NULL, \n\tvalue JSONB NOT NULL, \n\tPRIMARY KEY (id)\n)\n\n')
    op.execute('\nCREATE TABLE crm_tag (\n\tid UUID NOT NULL, \n\ttag_name VARCHAR(100) NOT NULL, \n\ttag_group VARCHAR(32), \n\tis_active BOOLEAN NOT NULL, \n\tcreated_by UUID NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (tag_name), \n\tFOREIGN KEY(created_by) REFERENCES sys_user (id)\n)\n\n')
    op.execute('\nCREATE TABLE crm_contact (\n\tid UUID NOT NULL, \n\tcustomer_id UUID NOT NULL, \n\tname VARCHAR(100) NOT NULL, \n\trole_label VARCHAR(64), \n\tdecision_role VARCHAR(32), \n\tmobile VARCHAR(32), \n\twechat VARCHAR(100), \n\temail VARCHAR(255), \n\tis_primary BOOLEAN NOT NULL, \n\trelationship_note TEXT, \n\tis_active BOOLEAN NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(customer_id) REFERENCES customer (id)\n)\n\n')
    op.execute('CREATE INDEX ix_crm_contact_customer_id ON crm_contact (customer_id)')
    op.execute('CREATE INDEX ix_crm_contact_mobile ON crm_contact (mobile)')
    op.execute('\nCREATE TABLE crm_opportunity (\n\tid UUID NOT NULL, \n\tcustomer_id UUID NOT NULL, \n\towner_user_id UUID NOT NULL, \n\topportunity_name VARCHAR(255) NOT NULL, \n\tstage VARCHAR(24) NOT NULL, \n\tstatus VARCHAR(20) NOT NULL, \n\testimated_amount NUMERIC(18, 2), \n\tprobability NUMERIC(5, 4), \n\texpected_close_date DATE, \n\tneed_summary TEXT, \n\tlost_reason VARCHAR(255), \n\tis_active BOOLEAN NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (id), \n\tCONSTRAINT ck_crm_probability CHECK (probability >= 0 AND probability <= 1), \n\tCONSTRAINT ck_crm_amount CHECK (estimated_amount >= 0), \n\tFOREIGN KEY(customer_id) REFERENCES customer (id), \n\tFOREIGN KEY(owner_user_id) REFERENCES sys_user (id)\n)\n\n')
    op.execute('CREATE INDEX ix_crm_opportunity_customer_id ON crm_opportunity (customer_id)')
    op.execute('CREATE INDEX ix_crm_opportunity_owner_user_id ON crm_opportunity (owner_user_id)')
    op.execute('\nCREATE TABLE customer_assignment_history (\n\tid UUID NOT NULL, \n\tcustomer_id UUID NOT NULL, \n\tfrom_user_id UUID, \n\tto_user_id UUID, \n\taction_type VARCHAR(24) NOT NULL, \n\treason TEXT NOT NULL, \n\toperated_by UUID NOT NULL, \n\toperated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(customer_id) REFERENCES customer (id), \n\tFOREIGN KEY(from_user_id) REFERENCES sys_user (id), \n\tFOREIGN KEY(to_user_id) REFERENCES sys_user (id), \n\tFOREIGN KEY(operated_by) REFERENCES sys_user (id)\n)\n\n')
    op.execute('CREATE INDEX ix_customer_assignment_history_customer_id ON customer_assignment_history (customer_id)')
    op.execute('\nCREATE TABLE customer_tag_map (\n\tcustomer_id UUID NOT NULL, \n\ttag_id UUID NOT NULL, \n\tcreated_by UUID NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (customer_id, tag_id), \n\tFOREIGN KEY(customer_id) REFERENCES customer (id), \n\tFOREIGN KEY(tag_id) REFERENCES crm_tag (id), \n\tFOREIGN KEY(created_by) REFERENCES sys_user (id)\n)\n\n')
    op.execute('\nCREATE TABLE crm_followup (\n\tid UUID NOT NULL, \n\tcustomer_id UUID NOT NULL, \n\tcontact_id UUID, \n\towner_user_id UUID NOT NULL, \n\toccurred_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tinteraction_method VARCHAR(24) NOT NULL, \n\tcontact_result VARCHAR(32) NOT NULL, \n\tsummary TEXT, \n\tmaterial_sent BOOLEAN NOT NULL, \n\tmaterial_note VARCHAR(255), \n\tquotation_sent BOOLEAN NOT NULL, \n\tnext_action VARCHAR(255), \n\tnext_followup_at TIMESTAMP WITH TIME ZONE, \n\tis_active BOOLEAN NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(customer_id) REFERENCES customer (id), \n\tFOREIGN KEY(contact_id) REFERENCES crm_contact (id), \n\tFOREIGN KEY(owner_user_id) REFERENCES sys_user (id)\n)\n\n')
    op.execute('CREATE INDEX ix_crm_followup_customer_id ON crm_followup (customer_id)')
    op.execute('CREATE INDEX ix_crm_followup_owner_user_id ON crm_followup (owner_user_id)')
    op.execute('\nCREATE TABLE crm_task (\n\tid UUID NOT NULL, \n\ttitle VARCHAR(255) NOT NULL, \n\tassignee_user_id UUID NOT NULL, \n\tcustomer_id UUID, \n\topportunity_id UUID, \n\tfollowup_id UUID, \n\tsource_type VARCHAR(24) NOT NULL, \n\ttask_type VARCHAR(32), \n\tdue_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tpriority VARCHAR(16) NOT NULL, \n\tstatus VARCHAR(20) NOT NULL, \n\tcompletion_result VARCHAR(100), \n\tcompleted_at TIMESTAMP WITH TIME ZONE, \n\tcreated_by UUID NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(assignee_user_id) REFERENCES sys_user (id), \n\tFOREIGN KEY(customer_id) REFERENCES customer (id), \n\tFOREIGN KEY(opportunity_id) REFERENCES crm_opportunity (id), \n\tUNIQUE (followup_id), \n\tFOREIGN KEY(followup_id) REFERENCES crm_followup (id), \n\tFOREIGN KEY(created_by) REFERENCES sys_user (id)\n)\n\n')
    op.execute('CREATE INDEX ix_crm_task_assignee_user_id ON crm_task (assignee_user_id)')
    op.execute('CREATE INDEX ix_crm_task_customer_id ON crm_task (customer_id)')
    op.execute('CREATE INDEX ix_crm_task_due_at ON crm_task (due_at)')


def downgrade():
    bind = op.get_bind()
    for table in ['crm_contact','crm_followup','crm_task','crm_opportunity','crm_tag','customer_assignment_history','crm_setting']:
        if bind.scalar(sa.text(f'SELECT count(*) FROM {table}')):
            raise RuntimeError('CRM data exists; restore a verified backup instead of destructive downgrade')
    if bind.scalar(sa.text("SELECT count(*) FROM customer WHERE crm_managed OR source_system = 'crm'")):
        raise RuntimeError("CRM data exists; restore a verified backup instead of destructive downgrade")
    op.execute('DROP TABLE crm_task')
    op.execute('DROP TABLE crm_followup')
    op.execute('DROP TABLE customer_tag_map')
    op.execute('DROP TABLE customer_assignment_history')
    op.execute('DROP TABLE crm_opportunity')
    op.execute('DROP TABLE crm_contact')
    op.execute('DROP TABLE crm_tag')
    op.execute('DROP TABLE crm_setting')
    op.execute('ALTER TABLE customer DROP CONSTRAINT fk_customer_bound')
    op.execute('ALTER TABLE customer DROP CONSTRAINT uq_customer_bound')
    op.execute('ALTER TABLE customer DROP COLUMN created_at')
    op.execute('ALTER TABLE customer DROP COLUMN crm_managed')
    op.execute('ALTER TABLE customer DROP COLUMN bound_customer_id')
    op.execute('ALTER TABLE customer DROP COLUMN bound_at')
    op.execute('ALTER TABLE customer DROP COLUMN public_pool_entered_at')
    op.execute('ALTER TABLE customer DROP COLUMN remark')
    op.execute('ALTER TABLE customer DROP COLUMN lifecycle_status')
    op.execute('ALTER TABLE customer DROP COLUMN customer_level')
    op.execute('ALTER TABLE customer DROP COLUMN customer_type')
    op.execute('ALTER TABLE customer DROP COLUMN ownership_status')
    op.execute('ALTER TABLE customer ALTER COLUMN customer_code SET NOT NULL')
    op.execute('ALTER TABLE customer ALTER COLUMN last_import_batch_id SET NOT NULL')
