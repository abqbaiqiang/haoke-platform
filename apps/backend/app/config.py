from functools import lru_cache
from ipaddress import ip_address
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)
    app_env: Literal["development", "test", "production"] = "development"
    app_timezone: Literal["Asia/Shanghai"] = "Asia/Shanghai"
    app_base_url: str = "http://localhost:8080"
    app_allowed_origins: str = ""
    allowed_origin_set: set[str] = set()
    database_url: SecretStr
    app_secret_key: SecretStr
    initial_admin_username: str = "admin"
    initial_admin_password: SecretStr | None = None
    demo_password: SecretStr | None = None
    session_hours: int = Field(default=8, ge=1, le=24)
    login_max_failures: int = Field(default=5, ge=1, le=20)
    login_lock_seconds: int = Field(default=900, ge=1)
    upload_root: str = "app-data/uploads"
    import_max_bytes: int = Field(default=12 * 1024 * 1024, ge=1024, le=32 * 1024 * 1024)
    # 腾讯位置服务（客户位置功能）：Web JS SDK Key 发浏览器（需配域名白名单），
    # WebService Key 仅服务端代理使用，绝不返回浏览器。
    tencent_map_web_key: SecretStr = SecretStr("")
    tencent_map_server_key: SecretStr = SecretStr("")
    cookie_secure: bool = False

    @model_validator(mode="after")
    def validate_runtime(self):
        secret = self.app_secret_key.get_secret_value()
        if len(secret) < 32 or "CHANGE_ME" in secret:
            raise ValueError("APP_SECRET_KEY must be a random secret of at least 32 characters")
        parsed = urlparse(self.app_base_url)
        if not parsed.hostname or parsed.scheme not in {"http", "https"} or parsed.path not in {"", "/"}:
            raise ValueError("APP_BASE_URL must be an HTTP(S) origin")
        self.app_base_url = self.app_base_url.rstrip("/")
        self.allowed_origin_set = {self.app_base_url} | {o.strip().rstrip("/") for o in self.app_allowed_origins.split(",") if o.strip()}
        # Cookie Secure 标记跟实际协议走：HTTP 下浏览器不会回传 Secure Cookie
        self.cookie_secure = parsed.scheme == "https"
        if self.app_env == "production" and parsed.scheme != "https":
            # docs/10：局域网试用阶段允许纯内网 IP 走 HTTP；域名/公网必须 HTTPS
            try:
                is_private_ip = ip_address(parsed.hostname).is_private
            except ValueError:
                is_private_ip = False
            if not is_private_ip:
                raise ValueError("Production requires HTTPS APP_BASE_URL (HTTP only for private LAN IPs)")
        if not self.database_url.get_secret_value().startswith("postgresql+psycopg://"):
            raise ValueError("DATABASE_URL must use PostgreSQL psycopg")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
