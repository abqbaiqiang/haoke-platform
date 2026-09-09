import secrets
from datetime import timedelta
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import ActivityLog, LoginSession, LoginThrottle, PermissionScope, User, utcnow
from app.permissions import Principal, can_edit_user, can_read_user
from app.schemas import ProfilePatch
from app.security import DUMMY_HASH, digest, verify_password


def audit(db: Session, user_id: UUID, activity: str, target_id: UUID | None = None, details: dict | None = None):
    db.add(
        ActivityLog(
            user_id=user_id, activity_type=activity, object_type="sys_user", object_id=target_id, details=details
        )
    )


def login(db: Session, username: str, password: str) -> tuple[User, str]:
    settings = get_settings()
    now = utcnow()
    key = digest("login:" + username.lower())
    db.execute(insert(LoginThrottle).values(key_hash=key, failures=0, window_start=now).on_conflict_do_nothing())
    throttle = db.scalar(select(LoginThrottle).where(LoginThrottle.key_hash == key).with_for_update())
    if now - throttle.window_start >= timedelta(seconds=settings.login_lock_seconds):
        throttle.failures = 0
        throttle.window_start = now
    if throttle.failures >= settings.login_max_failures:
        db.commit()
        raise HTTPException(429, "登录尝试过多，请稍后重试")
    user = db.scalar(select(User).where(User.username == username))
    valid = verify_password(password, user.password_hash if user else DUMMY_HASH)
    if not valid or not user or not user.is_active:
        throttle.failures += 1
        db.commit()
        raise HTTPException(401, "用户名或密码错误，或账号已停用")
    throttle.failures = 0
    token = secrets.token_urlsafe(48)
    db.add(
        LoginSession(
            user_id=user.id, token_hash=digest(token), expires_at=now + timedelta(hours=settings.session_hours)
        )
    )
    user.last_login_at = now
    audit(db, user.id, "user_login", user.id)
    db.commit()
    return user, token


def authenticate(db: Session, token: str | None) -> tuple[User, LoginSession]:
    if not token or len(token) > 256:
        raise HTTPException(401, "请先登录")
    session = db.scalar(
        select(LoginSession).where(
            LoginSession.token_hash == digest(token),
            LoginSession.revoked_at.is_(None),
            LoginSession.expires_at > utcnow(),
        )
    )
    user = db.get(User, session.user_id) if session else None
    if not user or not user.is_active:
        raise HTTPException(401, "会话已失效，请重新登录")
    return user, session


def principal_for(db: Session, user: User) -> Principal:
    scope = db.scalar(select(PermissionScope).where(PermissionScope.user_id == user.id))
    values = (scope.scope_value or {}).get("user_ids", []) if scope else []
    return Principal(user.id, user.role_code, scope.scope_type if scope else "none", frozenset(values))


def read_user(db: Session, principal: Principal, target_id: UUID) -> User:
    if not can_read_user(principal, target_id):
        raise HTTPException(404, "用户不存在或无权访问")
    user = db.get(User, target_id)
    if user is None:
        raise HTTPException(404, "用户不存在或无权访问")
    return user


def edit_profile(db: Session, principal: Principal, target_id: UUID, changes: ProfilePatch) -> User:
    if not can_edit_user(principal, target_id):
        raise HTTPException(404, "用户不存在或无权访问")
    user = read_user(db, principal, target_id)
    fields = changes.model_dump(exclude_unset=True)
    for key, value in fields.items():
        setattr(user, key, value)
    audit(db, principal.user_id, "user_profile_update", target_id, {"changed_fields": sorted(fields)})
    db.commit()
    return user
