"""销售端重构阶段②（docs/32）：全员项目看板、工作台汇总、跟进图片粘贴、作战区阶段。"""
import base64
from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

from app import crm_service as crm
from app.crm_models import Followup, Opportunity, OpportunityProduct, Task
from app.data_models import Customer, DataSource, ImportBatch, Product, SalesOrder, SalesOrderLine


def now():
    return datetime(2026, 9, 15, 10, tzinfo=crm.TZ)


def seed_customers(db, accounts):
    rows = []
    for name in ['S1', 'S2']:
        c = Customer(source_system='crm', customer_name=name + '客户', normalized_name=name + '客户',
                     owner_user_id=accounts[name].id, ownership_status='owned')
        db.add(c)
        rows.append(c)
    db.commit()
    return rows


def opp(db, accounts, customer, owner, name, stage='contact', amount=None, close=None, probability=None):
    o = Opportunity(customer_id=customer.id, owner_user_id=accounts[owner].id, opportunity_name=name,
                    stage=stage, estimated_amount=Decimal(amount) if amount else None,
                    probability=Decimal(probability) if probability else None,
                    expected_close_date=close)
    db.add(o)
    db.commit()
    return o


def task(db, accounts, c, due, owner='S1', title='确认需求'):
    t = Task(title=title, customer_id=c.id, assignee_user_id=accounts[owner].id,
             created_by=accounts[owner].id, due_at=due, source_type='manual', task_type='followup')
    db.add(t)
    db.commit()
    return t


def test_project_board_all_colleagues_visible_but_not_writable(db, client, accounts, sign_in):
    mine, other = seed_customers(db, accounts)
    source = DataSource(source_code='sr_test', source_name='测试账套', entity_name='测试公司')
    db.add(source)
    db.flush()
    batch = ImportBatch(data_source_id=source.id, business_type='sales', original_filename='fake.csv',
                        storage_path='not-a-real-file', file_hash='a' * 64, imported_by=accounts['Admin'].id,
                        status='succeeded')
    db.add(batch)
    db.flush()
    product = Product(source_system=source.source_code, product_code='P1', product_name='样品甲', last_import_batch_id=batch.id)
    db.add(product)
    db.commit()
    o_mine = opp(db, accounts, mine, 'S1', '中秋礼盒', 'negotiation', '50000.00', date(2026, 9, 28), probability='0.7000')
    opp(db, accounts, other, 'S2', '同行大单', 'contact')
    db.add(OpportunityProduct(opportunity_id=o_mine.id, product_id=product.id, created_by=accounts['S1'].id))
    db.commit()
    sign_in('S1')
    data = client.get('/api/sales/opportunities/board').json()
    assert data['total'] == 2
    rows = {r['opportunity_name']: r for r in data['rows']}
    assert set(rows) == {'中秋礼盒', '同行大单'}
    # 全员可见：S1 能看到 S2 的项目与负责人姓名（老板拍板，docs/32 阶段②）。
    assert rows['同行大单']['owner_name'] == accounts['S2'].display_name
    # 自己的项目带产品提报与百分比概率。
    assert rows['中秋礼盒']['products'][0]['name'] == '样品甲'
    assert rows['中秋礼盒']['probability'] == '70.0'
    assert rows['中秋礼盒']['estimated_amount'] == '50000.00'
    assert rows['中秋礼盒']['customer_name'] == 'S1客户'
    # 排序：有预计成交时间的在前。
    assert data['rows'][0]['opportunity_name'] == '中秋礼盒'
    # 非销售角色沿用销售端口径 403。
    sign_in('Owner')
    assert client.get('/api/sales/opportunities/board').status_code == 403
    # 只读放行：S1 改 S2 的项目仍被拒绝（铁律 5：权限在后端）。
    sign_in('S1')
    payload = {'opportunity_name': 'hack', 'owner_user_id': str(accounts['S1'].id), 'stage': 'won'}
    r = client.put(f"/api/crm/customers/{other.id}/opportunities/{rows['同行大单']['id']}", json=payload)
    assert r.status_code in {403, 404}


def test_workbench_summary_counts_and_rfm_key_customers(db, client, accounts, sign_in, monkeypatch):
    for target in ('app.sales_workspace.utcnow', 'app.bi_service.utcnow', 'app.bi_insights.utcnow', 'app.bi_access.utcnow'):
        monkeypatch.setattr(target, lambda: datetime(2026, 9, 15, 2, tzinfo=crm.TZ))
    mine, other = seed_customers(db, accounts)
    source = DataSource(source_code='sr_sum', source_name='汇总账套', entity_name='测试公司')
    db.add(source)
    db.flush()
    batch = ImportBatch(data_source_id=source.id, business_type='sales', original_filename='fake.csv',
                        storage_path='not-a-real-file', file_hash='b' * 64, imported_by=accounts['Admin'].id,
                        status='succeeded')
    db.add(batch)
    db.flush()
    product = Product(source_system=source.source_code, product_code='P1', product_name='样品甲', last_import_batch_id=batch.id)
    db.add(product)
    db.commit()

    def add_order(c, amount, day, ds=None, batch_=None):
        o = SalesOrder(source_system=(ds or source).source_code, order_no=uuid4().hex, order_date=date.fromisoformat(day),
                       customer_id=c.id, sales_user_id=accounts['S1'].id, sales_amount=Decimal(amount),
                       source_status='valid', content_hash=uuid4().hex,
                       updated_at=datetime(2026, 9, 14, tzinfo=crm.TZ), last_import_batch_id=(batch_ or batch).id)
        db.add(o)
        db.flush()
        db.add(SalesOrderLine(sales_order_id=o.id, version=1, line_no=1, product_id=product.id,
                              quantity=Decimal('1'), unit_name='盒', line_amount=Decimal(amount),
                              last_import_batch_id=batch.id))
    add_order(mine, '0.10', '2026-09-01')
    add_order(other, '100.00', '2026-09-03')
    # 沉睡+疑似流失样本：旧账套里的旧订单（距 monkeypatch 的 today(2026-09-15) 248 天，
    # >90 沉睡且 ≥180 疑似流失；级联口径不按账套过滤，S1 本月金额与来源可见性不受影响）。
    stale = Customer(source_system='crm', customer_name='S1休眠客户', normalized_name='S1休眠客户',
                     owner_user_id=accounts['S1'].id, ownership_status='owned')
    src_old = DataSource(source_code='sr_sum_old', source_name='旧账套', entity_name='测试公司')
    db.add_all([stale, src_old])
    db.flush()
    batch_old = ImportBatch(data_source_id=src_old.id, business_type='sales', original_filename='fake-old.csv',
                            storage_path='not-a-real-file', file_hash='c' * 64, imported_by=accounts['Admin'].id,
                            status='succeeded')
    db.add(batch_old)
    db.commit()
    add_order(stale, '30.00', '2026-01-10', ds=src_old, batch_=batch_old)
    db.commit()
    opp(db, accounts, mine, 'S1', '开放一')
    opp(db, accounts, other, 'S2', '开放二')
    task(db, accounts, mine, now() + timedelta(hours=1))
    task(db, accounts, mine, now() - timedelta(days=1))
    sign_in('S1')
    data = client.get(f'/api/sales/workbench-summary?source_id={source.id}').json()
    assert data['month'] == '2026-09-01'
    assert data['today_tasks'] == 1 and data['overdue_tasks'] == 1
    # 全员开放项目数（含同事）。
    assert data['open_projects'] == 2
    # 完成金额按已核实口径出数（导入即认可），乙客户 100.00 是重点客户（RFM 重要层）。
    assert data['actual_amount'] == '100.10'
    assert data['target_amount'] is None and data['completion'] is None
    assert data['key_customers'] == 1
    # 重点提醒与客户页级联标签同一口径（docs/32 §3.2）：提醒数=点击直达后的列表条数。
    assert data['dormant_customers'] == 1 and data['at_risk_customers'] == 1
    assert client.get('/api/sales/customers?status=dormant&limit=50').json()['total'] == 1
    assert client.get('/api/sales/customers?status=at_risk&limit=50').json()['total'] == 1
    # 数据源按销售订单 scope 把关：S2 在该来源无订单，汇总不可见（与既有一致）。
    sign_in('S2')
    assert client.get(f'/api/sales/workbench-summary?source_id={source.id}').status_code == 404


def test_followup_image_paste_end_to_end(db, client, accounts, sign_in):
    mine, _ = seed_customers(db, accounts)
    f = Followup(customer_id=mine.id, owner_user_id=accounts['S1'].id,
                 interaction_method='phone', contact_result='no_answer', occurred_at=now())
    db.add(f)
    db.commit()
    body = {'filename': '微信截图.png', 'content_type': 'image/png', 'data_base64': base64.b64encode(b'fake-png-bytes').decode()}
    sign_in('S1')
    saved = client.post(f'/api/sales/followups/{f.id}/attachments', json=body)
    assert saved.status_code == 201, saved.text
    att = saved.json()
    assert att['size_bytes'] == len(b'fake-png-bytes')
    # 列表与读取图片。
    assert len(client.get(f'/api/sales/followups/{f.id}/attachments').json()) == 1
    img = client.get(f"/api/sales/attachments/{att['id']}/image")
    assert img.status_code == 200 and img.headers['content-type'] == 'image/png'
    assert img.content == b'fake-png-bytes'
    # 跟进列表带出附件（销售端 recent 与 CRM 跟进历史）。
    recent = client.get('/api/sales/recent').json()['rows']
    assert recent[0]['attachments'][0]['id'] == att['id']
    crm_list = client.get('/api/crm/followups').json()
    assert any(a['id'] == att['id'] for row in crm_list for a in row['attachments'])
    # 同内容去重存储：sha256 相同再次粘贴仍是一条新记录但文件复用。
    client.post(f'/api/sales/followups/{f.id}/attachments', json=body)
    assert len(client.get(f'/api/sales/followups/{f.id}/attachments').json()) == 2
    # 越权：S2 不能给 S1 的跟进贴图，也读不到图片。
    sign_in('S2')
    assert client.post(f'/api/sales/followups/{f.id}/attachments', json=body).status_code == 404
    assert client.get(f"/api/sales/attachments/{att['id']}/image").status_code == 404
    # 大小上限（默认 5MB）。
    sign_in('S1')
    big = base64.b64encode(b'x' * (5 * 1024 * 1024 + 1)).decode()
    assert client.post(f'/api/sales/followups/{f.id}/attachments',
                       json={**body, 'data_base64': big}).status_code == 413
    # 非图片类型被 DTO 拒绝。
    assert client.post(f'/api/sales/followups/{f.id}/attachments',
                       json={**body, 'content_type': 'application/pdf'}).status_code == 422


def test_task_row_carries_customer_project_stage(db, client, accounts, sign_in):
    mine, _ = seed_customers(db, accounts)
    opp(db, accounts, mine, 'S1', '礼盒项目', 'selection')
    due = datetime.now(crm.TZ) + timedelta(hours=2)
    task(db, accounts, mine, due)
    sign_in('S1')
    row = client.get('/api/sales/tasks?view=today').json()['rows'][0]
    assert row['opp_stage'] == 'selection'
    # 无项目的客户任务阶段为空。
    bare = Customer(source_system='crm', customer_name='S1无项目客户', normalized_name='S1无项目客户',
                    owner_user_id=accounts['S1'].id, ownership_status='owned')
    db.add(bare)
    db.commit()
    task(db, accounts, bare, due + timedelta(hours=1), title='无项目任务')
    rows = client.get('/api/sales/tasks?view=today').json()['rows']
    assert {r['title']: r['opp_stage'] for r in rows}['无项目任务'] is None


def test_customer_tab_cascade_and_status_filter(db, client, accounts, sign_in):
    """docs/32 §3.2：标签页级联（沉睡>成交>报价中>意向>新客户，流失不入标签）+ status 筛选。"""
    from datetime import date, timedelta as td
    from app.data_models import SalesOrder
    today = date.today()
    rows = {}
    for key, name in [('deal', '甲成交'), ('dormant', '乙沉睡'), ('quoting', '丙报价'),
                      ('intent', '丁意向'), ('new', '戊新客'), ('lost', '己流失')]:
        c = Customer(source_system='crm', customer_name=name, normalized_name=name,
                     owner_user_id=accounts['S1'].id, ownership_status='owned')
        db.add(c)
        rows[key] = c
    db.commit()
    source = DataSource(source_code='sr_tab', source_name='标签账套', entity_name='测试公司')
    db.add(source)
    db.flush()
    batch = ImportBatch(data_source_id=source.id, business_type='sales', original_filename='fake.csv',
                        storage_path='x', file_hash='c' * 64, imported_by=accounts['Admin'].id, status='succeeded')
    db.add(batch)
    db.commit()

    def order(c, days_ago):
        db.add(SalesOrder(source_system=source.source_code, order_no=uuid4().hex,
                          order_date=today - td(days=days_ago), customer_id=c.id,
                          sales_user_id=accounts['S1'].id, sales_amount=Decimal('10'),
                          source_status='valid', content_hash=uuid4().hex,
                          updated_at=datetime.now(crm.TZ), last_import_batch_id=batch.id))
    order(rows['deal'], 3)
    order(rows['dormant'], 200)
    order(rows['lost'], 3)
    rows['lost'].lifecycle_status = 'lost'
    opp(db, accounts, rows['quoting'], 'S1', '丙项目', 'negotiation')
    opp(db, accounts, rows['intent'], 'S1', '丁项目', 'contact')
    db.commit()
    sign_in('S1')
    data = client.get('/api/sales/customers').json()
    # 200 天未成交同时命中疑似流失；key=3：三户金额相同（M 高=≥人均）均为 RFM 重要层。
    assert data['tabs'] == {'dormant': 1, 'deal': 1, 'quoting': 1, 'intent': 1, 'new': 1,
                            'at_risk': 1, 'key': 3}
    assert data['total'] == 6  # 流失客户仍在“全部”可见
    for status, expected in [('deal', '甲成交'), ('dormant', '乙沉睡'), ('quoting', '丙报价'),
                             ('intent', '丁意向'), ('new', '戊新客')]:
        page = client.get(f'/api/sales/customers?status={status}').json()
        assert page['total'] == 1 and page['rows'][0]['customer_name'] == expected, status
    assert client.get('/api/sales/customers?status=bogus').status_code == 422
    # 无效等级校验仍保留。
    assert client.get('/api/sales/customers?level=X').status_code == 422
