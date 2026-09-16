"""Shared request dependencies (审计 P2-09 收敛点)：DB 会话与已认证 Actor 的唯一定义。

API 层与 service 层统一从此处导入，避免 service 反向依赖 API 模块、
以及各 API 模块互相导入对方局部定义造成的环。
"""
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app import services
from app.db import get_db
from app.models import User

DB = Annotated[Session, Depends(get_db)]


def current_actor(request: Request, db: DB):
    return services.authenticate(db, request.cookies.get('songmao_session'))[0]


Actor = Annotated[User, Depends(current_actor)]


def current_identity(request: Request, db: DB):
    return services.authenticate(db, request.cookies.get('songmao_session'))


Current = Annotated[tuple, Depends(current_identity)]
