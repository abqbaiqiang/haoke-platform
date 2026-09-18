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
from app.constants import ROLE_ADMIN, ROLE_OWNER, ROLE_SALES
from app.db import get_db
from app.models import ActivityLog, LoginSession, PermissionScope, User, utcnow
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
    if user.role_code != ROLE_OWNER:
        raise HTTPException(403, '仅老板可管理同事账号')
    return user


@router.get('', response_model=list[StaffView])
def list_staff(db: Session = DB, actor=Depends(current)):
    return db.scalars(select(User).where(User.role_code != ROLE_ADMIN).order_by(User.display_name, User.username)).all()


@router.post('', response_model=StaffView, status_code=201)
def create_staff(payload: StaffCreate, db: Session = DB, actor=Depends(current)):
    if db.scalar(select(User.id).where(User.username == payload.username)):
        raise HTTPException(409, '账号已存在')
    try:
        password_hash = hash_password(payload.password)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    user = User(username=payload.username, display_name=payload.display_name,
                role_code=ROLE_SALES, password_hash=password_hash, mobile=payload.mobile)
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
    if not user or user.role_code != ROLE_SALES:
        raise HTTPException(404, '同事账号不存在')
    before = {'display_name': user.display_name, 'mobile': user.mobile, 'is_active': user.is_active}
    changes = payload.model_dump(exclude_unset=True)
    # Explicit nulls for non-nullable fields are a validation error, not a silent write.
    for key in ('display_name', 'is_active'):
        if key in changes and changes[key] is None:
            raise HTTPException(422, f'{key} 不能为空')
    password_reset = False
    if 'new_password' in changes:
        try:
            user.password_hash = hash_password(changes.pop('new_password'))
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        password_reset = True
        db.execute(update(LoginSession).where(LoginSession.user_id == user.id, LoginSession.revoked_at.is_(None))
                   .values(revoked_at=utcnow()))
    for key in ('display_name', 'mobile', 'is_active'):
        if key in changes:
            setattr(user, key, changes[key])
    if not user.is_active:
        db.execute(update(LoginSession).where(LoginSession.user_id == user.id, LoginSession.revoked_at.is_(None))
                   .values(revoked_at=utcnow()))
    details = {'before': before, 'changed': sorted(changes)}
    if password_reset:
        # Record the reset action explicitly; never the password itself.
        details['password_reset'] = True
        details['sessions_revoked'] = True
    audit(db, actor.id, 'staff_account_update', user.id, details)
    db.commit()
    db.refresh(user)
    return user


@router.delete('/{user_id}', status_code=204)
def delete_staff(user_id: uuid.UUID, db: Session = DB, actor=Depends(current)):
    """删除闲置同事账号（老板 2026-09-18 要求）。

    仅销售角色可删；名下有任何业务数据（铁律 6：留痕不可断）一律 409 并引导停用。
    无引用时连同权限范围、会话与其本人操作留痕一并删除，并由老板留痕一次删除动作。
    """
    from sqlalchemy import delete as sa_delete

    from app.bi_models import SalesReview, SalesTarget
    from app.crm_models import Assignment, CustomerClaim, Followup, FollowupAttachment, Opportunity, OpportunityProduct, Project, Task
    from app.data_models import Customer, ImportBatch, SalesOrder

    user = db.get(User, user_id)
    if not user or user.role_code != ROLE_SALES:
        raise HTTPException(404, '同事账号不存在')
    refs = {
        '客户归属': Customer.owner_user_id,
        '销售订单': SalesOrder.sales_user_id,
        '跟进记录': Followup.owner_user_id,
        '跟进图片': FollowupAttachment.created_by,
        '待办任务': Task.assignee_user_id,
        '创建的待办': Task.created_by,
        '项目': Opportunity.owner_user_id,
        '项目主档': Project.owner_user_id,
        '产品提报': OpportunityProduct.created_by,
        '客户认养': CustomerClaim.user_id,
        '归属调整留痕': Assignment.from_user_id,
        '归属调整留痕(转入)': Assignment.to_user_id,
        '归属调整操作': Assignment.operated_by,
        '导入批次': ImportBatch.imported_by,
        '销售目标': SalesTarget.user_id,
        '数据核实': SalesReview.reviewed_by,
    }
    held = sorted({label for label, col in refs.items()
                   if db.scalar(select(1).where(col == user_id).limit(1)) is not None})
    if held:
        raise HTTPException(409, f'该账号名下仍有业务数据（{"、".join(held)}），不能删除；请改用“停用”保留留痕')
    username, display_name = user.username, user.display_name
    db.execute(sa_delete(PermissionScope).where(PermissionScope.user_id == user_id))
    db.execute(sa_delete(LoginSession).where(LoginSession.user_id == user_id))
    # 其本人名下的操作留痕随账号删除（闲置账号只有建号事件）；老板留痕一次删除动作。
    db.execute(sa_delete(ActivityLog).where(ActivityLog.user_id == user_id))
    db.delete(user)
    audit(db, actor.id, 'staff_account_delete', None, {'username': username, 'display_name': display_name})
    db.commit()
