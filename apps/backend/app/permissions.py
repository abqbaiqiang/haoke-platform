from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class Principal:
    user_id: UUID
    role: str
    scope_type: str
    member_ids: frozenset[str] = frozenset()


def can_read_owned(principal: Principal, owner_id: UUID) -> bool:
    """Business ownership scope. Admin (system administrator) has full business read access,
    same as owner — decided by the boss on 2026-09-16, resolving docs/05's contradictory wording."""
    if principal.role in {"owner", "admin"}:
        return True
    if principal.role == "sales":
        return principal.user_id == owner_id
    if principal.role == "manager" and principal.scope_type == "team":
        return str(owner_id) in principal.member_ids or principal.user_id == owner_id
    if principal.role == "finance" and principal.scope_type == "custom":
        return str(owner_id) in principal.member_ids
    return False


def can_read_user(principal: Principal, target_id: UUID) -> bool:
    return principal.role == "admin" or principal.user_id == target_id or can_read_owned(principal, target_id)


def can_edit_user(principal: Principal, target_id: UUID) -> bool:
    return principal.role == "admin" or principal.user_id == target_id
