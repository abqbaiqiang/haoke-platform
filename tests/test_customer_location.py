"""客户位置管理测试（Web 端客户位置功能开发文档 V1.0 第 33 节）+ 地图代理测试。"""
import uuid

from sqlalchemy import select

from app.data_models import Customer
from app.models import ActivityLog


def make_customer(db, owner, name='位置测试客户'):
    obj = Customer(source_system='crm', customer_name=name, normalized_name=name, owner_user_id=owner,
                   ownership_status='owned', crm_managed=True)
    db.add(obj)
    db.commit()
    return obj


def test_location_unset_default(db, client, accounts, sign_in):
    obj = make_customer(db, accounts['S1'].id)
    sign_in('S1')
    r = client.get(f'/api/crm/customers/{obj.id}/location')
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['latitude'] is None and body['longitude'] is None
    assert body['location_status'] == 'unset'
    assert body['location_source'] is None and body['location_updated_by'] is None
    assert body['company_address'] is None and body['coordinate_system'] is None


def test_location_save_updates_modifier_and_audits(db, client, accounts, sign_in):
    obj = make_customer(db, accounts['S1'].id, '山东华礼商贸')
    sign_in('S1')
    payload = {'latitude': 36.1234567, 'longitude': 117.1234567,
               'coordinate_system': 'GCJ-02', 'location_source': 'map_drag'}
    r = client.put(f'/api/crm/customers/{obj.id}/location', json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['location_status'] == 'located'
    assert body['latitude'] == 36.1234567 and body['longitude'] == 117.1234567
    assert body['location_updated_at'] is not None
    assert body['location_updated_by']['display_name'] == 'S1'
    # 客户详情再读（模拟其他有权限账号/刷新）：同一份数据。
    assert client.get(f'/api/crm/customers/{obj.id}/location').json()['latitude'] == 36.1234567
    # 审计：至少记录新旧经纬度与操作人。
    event = db.scalar(select(ActivityLog).where(ActivityLog.activity_type == 'customer_location_update',
                                                ActivityLog.object_id == obj.id))
    assert event is not None
    after = event.details['after']
    assert after['latitude'] == 36.1234567 and after['location_source'] == 'map_drag'
    assert event.details['before']['latitude'] is None


def test_location_rejects_invalid_coordinates(db, client, accounts, sign_in):
    obj = make_customer(db, accounts['S1'].id)
    sign_in('Owner')
    assert client.put(f'/api/crm/customers/{obj.id}/location',
                      json={'latitude': 200, 'longitude': 117, 'location_source': 'map_click'}).status_code == 422
    assert client.put(f'/api/crm/customers/{obj.id}/location',
                      json={'latitude': 36, 'longitude': -300, 'location_source': 'map_click'}).status_code == 422
    assert client.put(f'/api/crm/customers/{obj.id}/location',
                      json={'latitude': 36, 'longitude': 117, 'location_source': 'unknown_source'}).status_code == 422


def test_location_requires_customer_access(db, client, accounts, sign_in):
    obj = make_customer(db, accounts['S1'].id)
    other = make_customer(db, accounts['S3'].id, '别的团队客户')
    sign_in('S1')
    payload = {'latitude': 36.1, 'longitude': 117.1, 'location_source': 'map_click'}
    # 不存在客户 → 404
    assert client.get(f'/api/crm/customers/{uuid.uuid4()}/location').status_code == 404
    assert client.put(f'/api/crm/customers/{uuid.uuid4()}/location', json=payload).status_code == 404
    # 无权限客户（S2 的 S3 客户）→ 404，与客户详情既定越权行为一致
    assert client.get(f'/api/crm/customers/{other.id}/location').status_code == 404
    assert client.put(f'/api/crm/customers/{other.id}/location', json=payload).status_code == 404
    # 有查看权、无编辑权（Finance：授权范围只读）→ GET 200 / PUT 403
    sign_in('Finance')
    assert client.get(f'/api/crm/customers/{obj.id}/location').status_code == 200
    assert client.put(f'/api/crm/customers/{obj.id}/location', json=payload).status_code == 403


def test_map_config_hides_keys_and_geocode_errors_are_clear(db, client, accounts, sign_in, monkeypatch):
    from app import map_service

    sign_in('S1')
    # 未配置 Key：config 报未启用、geocode 给明确中文错误
    r = client.get('/api/map/config')
    assert r.status_code == 200 and r.json() == {'enabled': False, 'web_key': None}
    r = client.get('/api/map/geocode', params={'address': '济南市历下区工业南路88号'})
    assert r.status_code == 503 and '未配置' in r.json()['error']['message']
    # 配置后：web key 下发（浏览器渲染必需），geocode 走代理并输出内部 DTO
    monkeypatch.setattr(map_service, 'map_web_key', lambda: 'web-key-for-browser')
    monkeypatch.setattr(map_service, 'map_server_key', lambda: 'server-key-secret')
    assert client.get('/api/map/config').json() == {'enabled': True, 'web_key': 'web-key-for-browser'}
    monkeypatch.setattr(map_service, 'fetch_json',
                        lambda url: {'status': 0, 'result': {'location': {'lat': 36.675, 'lng': 117.12}}})
    r = client.get('/api/map/geocode', params={'address': '济南市历下区工业南路88号'})
    assert r.status_code == 200, r.text
    assert r.json() == {'address': '济南市历下区工业南路88号', 'latitude': 36.675, 'longitude': 117.12,
                        'coordinate_system': 'GCJ-02'}
    # 供应商无结果 → 不返回任何坐标当成功
    monkeypatch.setattr(map_service, 'fetch_json', lambda url: {'status': 310, 'result': None})
    r = client.get('/api/map/geocode', params={'address': '不存在的地址'})
    assert r.status_code == 404 and '未找到准确位置' in r.json()['error']['message']
    # 供应商超时/异常 → 明确报错而非 500
    def boom(url):
        raise TimeoutError
    monkeypatch.setattr(map_service, 'fetch_json', boom)
    assert client.get('/api/map/geocode', params={'address': '济南'}).status_code == 502
