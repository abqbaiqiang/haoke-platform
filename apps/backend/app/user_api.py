"""Owner-facing staff account management.

V1 usage decision (2026-09-10): the company operates with the owner plus
sales staff only. The owner creates and manages colleague accounts here
instead of using CLI bootstrap commands. Password hashes use Argon2id,
every change is audited, and deactivation revokes live sessions.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app import services
from app.db import get_db
from app.models import LoginSession, PermissionScope, User, utcnow
from app.security import hash_password
from app.services import audit

router = APIRouter(prefix='/api/staff', tags=['人员管理'])
DB = Depends(get_db)
MIN_PASSWORD = 12


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid')


class StaffCreate(Strict):
    username: str = Field(min_length=2, max_length=64, pattern=r'^[a-zA-Z0-9_.@-]+$')
    display_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=MIN_PASSWORD, max_length=128, repr=False)
    mobile: str | None = Field(default=None, max_length=32)


class StaffPatch(Strict):
    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    mobile: str | None = Field(default=None, max_length=32)
    is_active: bool | None = None
    new_password: str | None = Field(default=None, min_length=MIN_PASSWORD, max_length=128, repr=False)


class StaffView(Strict):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    id: uuid.UUID
    username: str
    display_name: str
    role_code: str
    mobile: str | None
    is_active: bool
    last_login_at: object = None
    created_at: object = None


def current(request: Request, db: Session = DB):
    user, _ = services.authenticate(db, request.cookies.get('songmao_session'))
    # Only the owner manages staff accounts; admin keeps CLI bootstrap for recovery.
    if user.role_code != 'owner':
        raise HTTPException(403, '仅老板可管理同事账号')
    return user


@router.get('', response_model=list[StaffView])
def list_staff(db: Session = DB, actor=Depends(current)):
    return db.scalars(select(User).where(User.role_code != 'admin').order_by(User.display_name, User.username)).all()


@router.post('', response_model=StaffView, status_code=201)
def create_staff(payload: StaffCreate, db: Session = DB, actor=Depends(current)):
    if db.scalar(select(User.id).where(User.username == payload.username)):
        raise HTTPException(409, '账号已存在')
    try:
        password_hash = hash_password(payload.password)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    user = User(username=payload.username, display_name=payload.display_name,
                role_code='sales', password_hash=password_hash, mobile=payload.mobile)
    db.add(user)
    db.flush()
    # Sales scope: strictly own data until the owner grants more later.
    db.add(PermissionScope(user_id=user.id, scope_type='self', scope_value={'user_ids': []}))
    audit(db, actor.id, 'staff_account_create', user.id, {'username': payload.username})
    db.commit()
    return user


@router.patch('/{user_id}', response_model=StaffView)
def patch_staff(user_id: uuid.UUID, payload: StaffPatch, db: Session = DB, actor=Depends(current)):
    user = db.get(User, user_id)
    if not user or user.role_code != 'sales':
        raise HTTPException(404, '同事账号不存在')
    before = {'display_name': user.display_name, 'mobile': user.mobile, 'is_active': user.is_active}
    changes = payload.model_dump(exclude_unset=True)
    if 'new_password' in changes:
        try:
            user.password_hash = hash_password(changes.pop('new_password'))
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        db.execute(update(LoginSession).where(LoginSession.user_id == user.id, LoginSession.revoked_at.is_(None))
                   .values(revoked_at=utcnow()))
    for key in ('display_name', 'mobile', 'is_active'):
        if key in changes:
            setattr(user, key, changes[key])
    if not user.is_active:
        db.execute(update(LoginSession).where(LoginSession.user_id == user.id, LoginSession.revoked_at.is_(None))
                   .values(revoked_at=utcnow()))
    audit(db, actor.id, 'staff_account_update', user.id, {'before': before, 'changed': sorted(changes)})
    db.commit()
    db.refresh(user)
    return user
