import json
import logging
from pathlib import Path
import uuid

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import services
from app.bi_api import router as bi_router
from app.config import get_settings
from app.crm_api import router as crm_router
from app.deps import Current, DB
from app.import_api import router as data_router
from app.models import utcnow
from app.sales_api import router as sales_router
from app.schemas import LoginInput, ProfilePatch, SessionView, StatusView, UserView
from app.user_api import router as user_router

settings = get_settings()
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("songmao")
app = FastAPI(
    title="松茂经营管理平台",
    version="0.4.0",
    debug=False,
    docs_url=None if settings.app_env == "production" else "/api/docs",
    redoc_url=None,
    openapi_url=None if settings.app_env == "production" else "/api/openapi.json",
)
COOKIE = "songmao_session"

app.include_router(data_router)
app.include_router(crm_router)
app.include_router(bi_router)
app.include_router(user_router)
app.include_router(sales_router)


def error_response(request: Request, status: int, message: str):
    return JSONResponse(
        status_code=status,
        content={
            "error": {
                "code": f"HTTP_{status}",
                "message": message,
                "request_id": getattr(request.state, "request_id", ""),
            }
        },
    )


def alembic_head() -> str:
    """当前迁移脚本的 head，避免在代码中硬编码版本串。"""
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    return ScriptDirectory.from_config(cfg).get_current_head()


@app.middleware("http")
async def request_boundary(request: Request, call_next):
    request.state.request_id = str(uuid.uuid4())
    if request.method not in {"GET", "HEAD", "OPTIONS"} and request.headers.get("origin") not in settings.allowed_origin_set:
        response = error_response(request, 403, "请求来源未获授权")
    else:
        try:
            response = await call_next(request)
        except Exception:
            # Never log exceptions, request bodies, query strings or authentication headers.
            response = error_response(request, 500, "服务暂时不可用")
    response.headers["X-Request-ID"] = request.state.request_id
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    logger.info(
        json.dumps(
            {
                "event": "http_request",
                "request_id": request.state.request_id,
                "method": request.method,
                "status": response.status_code,
            }
        )
    )
    return response


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    return error_response(request, exc.status_code, str(exc.detail))


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    return error_response(request, 422, "输入字段不符合要求")


@app.get("/health", response_model=StatusView)
def health(db: DB):
    try:
        db.execute(text("SELECT 1"))
        if db.execute(text("SELECT version_num FROM alembic_version")).scalar_one() != alembic_head():
            raise HTTPException(503, "数据库版本未就绪")
    except SQLAlchemyError:
        raise HTTPException(503, "数据库未就绪") from None
    return StatusView()


@app.post("/api/auth/login", response_model=UserView)
def login(payload: LoginInput, response: Response, db: DB, request: Request):
    user, token = services.login(db, payload.username, payload.password)
    old = request.cookies.get(COOKIE)
    if old:
        try:
            _, session = services.authenticate(db, old)
            session.revoked_at = utcnow()
            db.commit()
        except HTTPException:
            pass
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="lax",
        max_age=settings.session_hours * 3600,
        path="/",
    )
    return user


@app.post("/api/auth/logout", status_code=204)
def logout(response: Response, db: DB, identity: Current):
    user, session = identity
    session.revoked_at = utcnow()
    services.audit(db, user.id, "user_logout", user.id)
    db.commit()
    response.delete_cookie(COOKIE, path="/", httponly=True, secure=settings.app_env == "production", samesite="lax")


@app.get("/api/auth/me", response_model=SessionView)
def me(db: DB, identity: Current):
    principal = services.principal_for(db, identity[0])
    return SessionView(
        user=UserView.model_validate(identity[0]),
        scope_type=principal.scope_type,
        member_ids=sorted(principal.member_ids),
        timezone=settings.app_timezone,
    )


@app.get("/api/owner/status", response_model=StatusView)
def owner_status(identity: Current):
    if identity[0].role_code != "owner":
        raise HTTPException(403, "仅老板角色可访问")
    return StatusView()


@app.get("/api/admin/status", response_model=StatusView)
def admin_status(identity: Current):
    if identity[0].role_code not in {"admin", "owner"}:
        raise HTTPException(403, "无系统查看权限")
    return StatusView()


@app.get("/api/users/{user_id}", response_model=UserView)
def user_detail(user_id: uuid.UUID, db: DB, identity: Current):
    return services.read_user(db, services.principal_for(db, identity[0]), user_id)


@app.patch("/api/users/{user_id}", response_model=UserView)
def profile_update(user_id: uuid.UUID, payload: ProfilePatch, db: DB, identity: Current):
    return services.edit_profile(db, services.principal_for(db, identity[0]), user_id, payload)
