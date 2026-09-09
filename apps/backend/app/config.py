from functools import lru_cache
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)
    app_env: Literal["development", "test", "production"] = "development"
    app_timezone: Literal["Asia/Shanghai"] = "Asia/Shanghai"
    app_base_url: str = "http://localhost:8080"
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

    @model_validator(mode="after")
    def validate_runtime(self):
        secret = self.app_secret_key.get_secret_value()
        if len(secret) < 32 or "CHANGE_ME" in secret:
            raise ValueError("APP_SECRET_KEY must be a random secret of at least 32 characters")
        parsed = urlparse(self.app_base_url)
        if not parsed.hostname or parsed.scheme not in {"http", "https"} or parsed.path not in {"", "/"}:
            raise ValueError("APP_BASE_URL must be an HTTP(S) origin")
        self.app_base_url = self.app_base_url.rstrip("/")
        if self.app_env == "production" and parsed.scheme != "https":
            raise ValueError("Production requires HTTPS APP_BASE_URL")
        if not self.database_url.get_secret_value().startswith("postgresql+psycopg://"):
            raise ValueError("DATABASE_URL must use PostgreSQL psycopg")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
