"""Explicit account bootstrap; demo accounts are never created in production."""

import argparse

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_engine
from app.models import LoginSession, PermissionScope, User, utcnow
from app.security import hash_password
from app.services import audit


def create_user(db, username, role, password, scope_type, member_ids=None, active=True):
    existing = db.scalar(select(User).where(User.username == username))
    if existing:
        return existing
    user = User(
        username=username,
        display_name=username,
        role_code=role,
        password_hash=hash_password(password),
        is_active=active,
    )
    db.add(user)
    db.flush()
    db.add(PermissionScope(user_id=user.id, scope_type=scope_type, scope_value={"user_ids": member_ids or []}))
    audit(db, user.id, "user_bootstrap", user.id)
    return user


def bootstrap_admin(db):
    cfg = get_settings()
    if db.scalar(select(User).where(User.username == cfg.initial_admin_username)):
        return
    if cfg.initial_admin_password is None:
        raise ValueError("INITIAL_ADMIN_PASSWORD required for first bootstrap")
    create_user(db, cfg.initial_admin_username, "admin", cfg.initial_admin_password.get_secret_value(), "custom")


def seed_demo(db):
    cfg = get_settings()
    if cfg.app_env == "production":
        raise ValueError("Demo accounts are forbidden in production")
    if cfg.demo_password is None:
        raise ValueError("DEMO_PASSWORD required")
    password = cfg.demo_password.get_secret_value()
    first = create_user(db, "demo_sales", "sales", password, "self")
    create_user(db, "demo_sales2", "sales", password, "self")
    create_user(db, "demo_manager", "manager", password, "team", [str(first.id)])
    create_user(db, "demo_finance", "finance", password, "custom", [str(first.id)])
    create_user(db, "demo_owner", "owner", password, "all")
    create_user(db, "demo_admin", "admin", password, "custom")
    create_user(db, "demo_disabled", "sales", password, "self", active=False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["bootstrap-admin", "seed-demo", "set-active", "reset-password"])
    parser.add_argument("--username")
    parser.add_argument("--active", choices=["true", "false"])
    args = parser.parse_args()
    with Session(get_engine()) as db:
        if args.command == "bootstrap-admin":
            bootstrap_admin(db)
        elif args.command == "seed-demo":
            seed_demo(db)
        else:
            actor = db.scalar(
                select(User).where(
                    User.username == get_settings().initial_admin_username,
                    User.role_code == "admin",
                    User.is_active.is_(True),
                )
            )
            user = db.scalar(select(User).where(User.username == args.username))
            if not actor or not user:
                raise ValueError("Active bootstrap administrator and target user required")
            if args.command == "set-active":
                if args.active is None or user.id == actor.id:
                    raise ValueError("--active required; bootstrap administrator cannot disable itself")
                user.is_active = args.active == "true"
            else:
                import getpass

                user.password_hash = hash_password(getpass.getpass("New password: "))
            db.execute(
                update(LoginSession)
                .where(LoginSession.user_id == user.id, LoginSession.revoked_at.is_(None))
                .values(revoked_at=utcnow())
            )
            audit(db, actor.id, "user_account_update", user.id, {"action": args.command})
        db.commit()
    print("Account operation completed; credentials are never printed.")


if __name__ == "__main__":
    main()
