"""docs/31 第 1 期项目管理升级：项目主档/联想、跨客户产品冲突、停滞判定、下一步必填、5 指标汇总。"""
from datetime import timedelta
from decimal import Decimal

from sqlalchemy import select, update

from app.crm_models import Opportunity, Project, Task
from app.models import utcnow


def make_customer(db, owner, name):
    from app.data_models import Customer
    obj = Customer(source_system='crm', customer_name=name, normalized_name=name, owner_user_id=owner,
                   ownership_status='owned', crm_managed=True)
    db.add(obj)
    db.commit()
    return obj


def make_product(db, actor_id, code, name):
    """建商品主档（需挂数据源+导入批次满足外键约束）：项目测试不依赖导入链路。"""
    from app.data_models import DataSource, ImportBatch, Product as ProductModel
    src = DataSource(source_code=f'proj_{code}', source_name=f'项目测试源 {code}', entity_name='项目测试', is_enabled=True)
    db.add(src)
    db.flush()
    batch = ImportBatch(data_source_id=src.id, business_type='product', original_filename=f'{code}.csv',
                        storage_path='p.csv', file_hash=(code * 32)[:64], status='success', imported_by=actor_id)
    db.add(batch)
    db.flush()
    obj = ProductModel(source_system='proj_src', product_code=code, product_name=name, last_import_batch_id=batch.id)
    db.add(obj)
    db.commit()
    return obj


def test_project_master_suggest_and_multi_customer(db, client, accounts, sign_in):
    sign_in('S1')
    a = make_customer(db, accounts['S1'].id, '张三商贸')
    body = {'opportunity_name': '张三·开门红推荐', 'owner_user_id': str(accounts['S1'].id),
            'project_name': '2026 保险开门红', 'next_promotion': '本周内发送方案'}
    r = client.post(f'/api/crm/customers/{a.id}/opportunities', json=body)
    assert r.status_code == 201, r.text
    assert r.json()['project_name'] == '2026 保险开门红'
    suggest = client.get('/api/crm/projects/suggest', params={'q': '2026 保险'}).json()
    assert len(suggest) == 1 and suggest[0]['project_name'] == '2026 保险开门红'
    assert suggest[0]['customer_count'] == 1
    # 联想选中同一项目 → 第二家客户的推荐挂在同一项目下。
    b = make_customer(db, accounts['S1'].id, '李四商贸')
    body_b = dict(body, opportunity_name='李四·开门红推荐', project_id=suggest[0]['id'], project_name=None)
    r = client.post(f'/api/crm/customers/{b.id}/opportunities', json=body_b)
    assert r.status_code == 201 and r.json()['project_name'] == '2026 保险开门红'
    suggest = client.get('/api/crm/projects/suggest', params={'q': '2026'}).json()
    assert suggest[0]['customer_count'] == 2
    # 停用主档后联想不再出现，引用校验拒绝。
    project = db.scalar(select(Project))
    project.is_active = False
    db.commit()
    assert client.get('/api/crm/projects/suggest', params={'q': '2026'}).json() == []
    r = client.post(f'/api/crm/customers/{a.id}/opportunities', json=dict(body, project_id=str(project.id)))
    assert r.status_code == 422


def test_cross_customer_product_conflict_warns_but_does_not_block(db, client, accounts, sign_in):
    sign_in('S1')
    p1 = make_product(db, accounts['S1'].id, 'CP1', '钛杯')
    a = make_customer(db, accounts['S1'].id, '张三商贸')
    b = make_customer(db, accounts['S1'].id, '李四商贸')
    first = client.post(f'/api/crm/customers/{a.id}/opportunities', json={
        'opportunity_name': 'A 推荐', 'owner_user_id': str(accounts['S1'].id), 'project_name': '开门红',
        'product_ids': [str(p1.id)], 'next_promotion': '跟进选品'})
    assert first.status_code == 201, first.text
    project_id = first.json()['project_id']
    # 同项目、另一客户推荐同一产品 → 409 + 结构化 conflicts（提醒不拦截）。
    payload = {'opportunity_name': 'B 推荐', 'owner_user_id': str(accounts['S1'].id),
               'project_id': project_id, 'product_ids': [str(p1.id)], 'next_promotion': '跟进选品'}
    blocked = client.post(f'/api/crm/customers/{b.id}/opportunities', json=payload)
    assert blocked.status_code == 409
    error = blocked.json()['error']
    assert error['code'] == 'cross_customer_product_conflict'
    assert error['conflicts'][0]['product_name'] == '钛杯'
    assert error['conflicts'][0]['customer_name'] == '张三商贸'
    assert error['conflicts'][0]['project_name'] == '开门红'
    assert len(error['conflicts'][0]['month']) == 7
    # 确认后可继续保存。
    ok = client.post(f'/api/crm/customers/{b.id}/opportunities', json={**payload, 'confirm_cross_customer': True})
    assert ok.status_code == 201, ok.text
    # 更新时客户 A 的推荐仍在同项目下 → 跨客户提醒再次出现；确认后可保存。
    update_payload = {'opportunity_name': 'B 推荐', 'owner_user_id': str(accounts['S1'].id),
                      'project_id': project_id, 'product_ids': [str(p1.id)], 'next_promotion': '跟进选品'}
    assert client.put(f"/api/crm/customers/{b.id}/opportunities/{ok.json()['id']}", json=update_payload).status_code == 409
    again = client.put(f"/api/crm/customers/{b.id}/opportunities/{ok.json()['id']}",
                       json={**update_payload, 'confirm_cross_customer': True})
    assert again.status_code == 200


def test_next_promotion_or_linked_task_required(db, client, accounts, sign_in):
    sign_in('S1')
    c = make_customer(db, accounts['S1'].id, '下一步客户')
    payload = {'opportunity_name': '健康项目', 'owner_user_id': str(accounts['S1'].id)}
    assert client.post(f'/api/crm/customers/{c.id}/opportunities', json=payload).status_code == 422
    ok = client.post(f'/api/crm/customers/{c.id}/opportunities', json={**payload, 'next_promotion': '9月20日发送方案'})
    assert ok.status_code == 201, ok.text
    oid = ok.json()['id']
    url = f'/api/crm/customers/{c.id}/opportunities/{oid}'
    # 清空下一步且无关联待办 → 422。
    assert client.put(url, json={**payload, 'next_promotion': None}).status_code == 422
    # 挂一个开放待办后允许无“下一步推进”。
    db.add(Task(opportunity_id=ok.json()['id'], customer_id=c.id, assignee_user_id=accounts['S1'].id,
                title='跟进选品', due_at=utcnow() + timedelta(days=1), source_type='manual',
                created_by=accounts['S1'].id, task_type='followup'))
    db.commit()
    assert client.put(url, json={**payload, 'next_promotion': None}).status_code == 200
    # 关闭阶段不受“下一步必填”约束（成交即终点）。
    won = client.put(url, json={**payload, 'stage': 'won', 'next_promotion': None})
    assert won.status_code == 200 and won.json()['status'] == 'won'


def test_stagnation_warn_and_risk_levels(db, client, accounts, sign_in):
    sign_in('S1')
    c = make_customer(db, accounts['S1'].id, '停滞客户')
    r = client.post(f'/api/crm/customers/{c.id}/opportunities', json={
        'opportunity_name': '停滞项目', 'owner_user_id': str(accounts['S1'].id), 'next_promotion': '待办推进'})
    oid = r.json()['id']
    def rows():
        return client.get('/api/crm/opportunities').json()
    assert rows()[0]['stagnant_level'] is None
    db.execute(update(Opportunity).where(Opportunity.id == oid).values(next_promotion=None, updated_at=utcnow() - timedelta(days=8)))
    db.commit()
    assert rows()[0]['stagnant_level'] == 'warn' and rows()[0]['stagnant_days'] >= 8
    db.execute(update(Opportunity).where(Opportunity.id == oid).values(updated_at=utcnow() - timedelta(days=20)))
    db.commit()
    assert rows()[0]['stagnant_level'] == 'risk'
    # 有下一步推进的不判停滞。
    db.execute(update(Opportunity).where(Opportunity.id == oid).values(next_promotion='重新推进', updated_at=utcnow() - timedelta(days=30)))
    db.commit()
    assert rows()[0]['stagnant_level'] is None


def test_opportunity_summary_five_metrics_and_scope(db, client, accounts, sign_in):
    from decimal import Decimal as D
    sign_in('S1')
    c1 = make_customer(db, accounts['S1'].id, '汇总客户一')
    c2 = make_customer(db, accounts['S1'].id, '汇总客户二')
    base = {'owner_user_id': str(accounts['S1'].id), 'next_promotion': '推进中'}
    from app.config import get_settings
    from zoneinfo import ZoneInfo
    today = utcnow().astimezone(ZoneInfo(get_settings().app_timezone)).date()
    client.post(f'/api/crm/customers/{c1.id}/opportunities', json={
        **base, 'opportunity_name': '金额项目', 'estimated_amount': '100.00', 'probability': '0.5',
        'expected_close_date': today.replace(day=15).isoformat()})
    client.post(f'/api/crm/customers/{c2.id}/opportunities', json={
        **base, 'opportunity_name': '无概率项目', 'estimated_amount': '200.00'})
    r = client.post(f'/api/crm/customers/{c1.id}/opportunities', json={
        **base, 'opportunity_name': '停滞项目', 'estimated_amount': '50.00'})
    db.execute(update(Opportunity).where(Opportunity.id == r.json()['id']).values(
        next_promotion=None, updated_at=utcnow() - timedelta(days=30)))
    db.commit()
    summary = client.get('/api/crm/opportunities/summary').json()
    assert summary['open_count'] == 3
    assert Decimal(summary['open_amount']) == D('350.00')
    assert Decimal(summary['weighted_amount']) == D('50.00')  # 100×0.5；无概率与停滞项不计加权
    assert summary['expected_this_month'] == 1
    assert summary['stagnant_count'] == 1
    # S2 自范围看不到 S1 的任何项目。
    sign_in('S2')
    empty = client.get('/api/crm/opportunities/summary').json()
    assert empty['open_count'] == 0 and empty['stagnant_count'] == 0
    # 财务无 CRM 项目权限。
    sign_in('Finance')
    assert client.get('/api/crm/opportunities/summary').status_code == 403


def test_settings_stage_probability_and_stagnation_thresholds(db, client, accounts, sign_in):
    sign_in('Owner')
    defaults = client.get('/api/crm/settings').json()
    assert defaults['stage_probability']['negotiation'] == 0.70  # 大单议价 70%
    assert defaults['stagnant_warn_days'] == 7 and defaults['stagnant_risk_days'] == 14
    saved = client.put('/api/crm/settings', json={**defaults, 'stage_probability': {**defaults['stage_probability'], 'negotiation': 0.65},
                                                  'stagnant_warn_days': 5, 'stagnant_risk_days': 10})
    assert saved.status_code == 200
    again = client.get('/api/crm/settings').json()
    assert again['stage_probability']['negotiation'] == 0.65
    assert again['stagnant_warn_days'] == 5 and again['stagnant_risk_days'] == 10
    # 销售不能改设置。
    sign_in('S1')
    assert client.put('/api/crm/settings', json=again).status_code == 403
