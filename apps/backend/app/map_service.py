"""腾讯位置服务代理（Web 端客户位置功能开发文档 V1.0 第 20/22/27/36 节）。

- 服务端只代理 WebService 地址解析；server key 绝不返回浏览器。
- 未配置/无结果/超时都返回明确中文错误，绝不返回 (0,0) 或城市中心点当成功。
- 正常 CRM 查询不依赖外部地图 API（位置已保存的从数据库直接读）。
"""
import json
from urllib.parse import quote
from urllib.request import urlopen

from fastapi import HTTPException

from app.config import get_settings

GEOCODE_URL = "https://apis.map.qq.com/ws/geocoder/v1/?address={address}&key={key}"
HTTP_TIMEOUT_SECONDS = 5


def map_web_key() -> str:
    return get_settings().tencent_map_web_key.get_secret_value().strip()


def map_server_key() -> str:
    return get_settings().tencent_map_server_key.get_secret_value().strip()


def fetch_json(url: str) -> dict:
    # 独立函数便于测试替换；标准库即可，不为单端点引入运行时 HTTP 依赖。
    with urlopen(url, timeout=HTTP_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def geocode(address: str) -> dict:
    server_key = map_server_key()
    if not server_key:
        raise HTTPException(503, "地图服务未配置，请联系管理员")
    url = GEOCODE_URL.format(address=quote(address), key=quote(server_key))
    try:
        data = fetch_json(url)
    except Exception:
        raise HTTPException(502, "地图服务暂时不可用，请稍后重试") from None
    result = data.get("result") or {}
    location = result.get("location") or {}
    if data.get("status") != 0 or "lat" not in location or "lng" not in location:
        raise HTTPException(404, "未找到准确位置，请修改搜索关键词或直接在地图上选择")
    return {"address": address, "latitude": location["lat"], "longitude": location["lng"],
            "coordinate_system": "GCJ-02"}
