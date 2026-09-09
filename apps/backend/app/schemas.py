from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

Role = Literal["owner", "manager", "sales", "finance", "admin"]


class LoginInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_.@-]+$")
    password: str = Field(min_length=1, max_length=128, repr=False)


class UserView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    username: str
    display_name: str
    role_code: Role
    mobile: str | None
    email: str | None
    is_active: bool
    last_login_at: datetime | None


class ProfilePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mobile: str | None = Field(default=None, max_length=32)
    email: str | None = Field(default=None, max_length=255)


class SessionView(BaseModel):
    user: UserView
    scope_type: str
    member_ids: list[str]
    timezone: str


class StatusView(BaseModel):
    status: str = "ok"
    milestone: str = "M2"
