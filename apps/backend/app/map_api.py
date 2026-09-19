from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict

from app import map_service
from app.deps import Actor

router = APIRouter(prefix='/api/map', tags=['Map'])


class MapConfig(BaseModel):
    model_config = ConfigDict(extra='forbid')
    enabled: bool
    web_key: str | None = None


class GeocodeResult(BaseModel):
    model_config = ConfigDict(extra='forbid')
    address: str
    latitude: float
    longitude: float
    coordinate_system: str


@router.get('/config', response_model=MapConfig)
def config(actor: Actor):
    """Web JS SDK Key 下发（客户端渲染地图必需，需域名白名单保护）；server key 绝不外发。"""
    web_key = map_service.map_web_key()
    return MapConfig(enabled=bool(web_key), web_key=web_key or None)


@router.get('/geocode', response_model=GeocodeResult)
def geocode(actor: Actor, address: str = Query(min_length=1, max_length=255)):
    return map_service.geocode(address)
