"""履歴の保存先。

Supabase の設定があれば Supabase に保存し、なければメモリに保存する
（APIキーを持っていないメンバーでもローカルで動かせるようにするため。再起動で消える）。
"""

import copy
import logging
import uuid
from datetime import UTC, datetime
from functools import lru_cache
from typing import Protocol

from .config import settings

logger = logging.getLogger(__name__)

# 一覧に返す列（解説の全文などの重いデータは含めない）
LIST_COLUMNS = "id, topic, pattern, understanding, status, title, genre, summary, next_step, created_at, completed_at"


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True


class Repository(Protocol):
    def create_session(self, data: dict) -> dict: ...
    def get_session(self, session_id: str) -> dict | None: ...
    def update_session(self, session_id: str, fields: dict) -> None: ...
    def add_explanation(self, session_id: str, attempt: int, content: str) -> None: ...
    def list_sessions(self, user_id: str, limit: int) -> list[dict]: ...


class SupabaseRepository:
    def __init__(self, url: str, key: str):
        from supabase import create_client

        self.client = create_client(url, key)

    def create_session(self, data: dict) -> dict:
        return self.client.table("sessions").insert(data).execute().data[0]

    def get_session(self, session_id: str) -> dict | None:
        if not _is_uuid(session_id):
            return None
        rows = (
            self.client.table("sessions")
            .select("*, explanations(attempt, content, created_at)")
            .eq("id", session_id)
            .limit(1)
            .execute()
            .data
        )
        if not rows:
            return None
        session = rows[0]
        session["explanations"] = sorted(session.get("explanations") or [], key=lambda e: e["attempt"])
        return session

    def update_session(self, session_id: str, fields: dict) -> None:
        self.client.table("sessions").update(fields).eq("id", session_id).execute()

    def add_explanation(self, session_id: str, attempt: int, content: str) -> None:
        self.client.table("explanations").insert(
            {"session_id": session_id, "attempt": attempt, "content": content}
        ).execute()

    def list_sessions(self, user_id: str, limit: int) -> list[dict]:
        return (
            self.client.table("sessions")
            .select(LIST_COLUMNS)
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
            .data
        )


class InMemoryRepository:
    def __init__(self) -> None:
        self._sessions: dict[str, dict] = {}

    def create_session(self, data: dict) -> dict:
        session = {
            "id": str(uuid.uuid4()),
            "details": {},
            "understanding": None,
            "status": "in_progress",
            "title": None,
            "genre": None,
            "summary": None,
            "key_points": None,
            "next_step": None,
            "unclear": None,
            "created_at": now_iso(),
            "completed_at": None,
            **data,
            "explanations": [],
        }
        self._sessions[session["id"]] = session
        return {k: copy.deepcopy(v) for k, v in session.items() if k != "explanations"}

    def get_session(self, session_id: str) -> dict | None:
        session = self._sessions.get(session_id)
        return copy.deepcopy(session) if session else None

    def update_session(self, session_id: str, fields: dict) -> None:
        self._sessions[session_id].update(copy.deepcopy(fields))

    def add_explanation(self, session_id: str, attempt: int, content: str) -> None:
        self._sessions[session_id]["explanations"].append(
            {"attempt": attempt, "content": content, "created_at": now_iso()}
        )

    def list_sessions(self, user_id: str, limit: int) -> list[dict]:
        columns = [c.strip() for c in LIST_COLUMNS.split(",")]
        rows = [s for s in self._sessions.values() if s["user_id"] == user_id]
        rows.sort(key=lambda s: s["created_at"], reverse=True)
        return [{c: copy.deepcopy(s.get(c)) for c in columns} for s in rows[:limit]]


@lru_cache
def get_repository() -> Repository:
    if settings.supabase_url and settings.supabase_key:
        return SupabaseRepository(settings.supabase_url, settings.supabase_key)
    logger.warning("SUPABASE_URL / SUPABASE_KEY が未設定のため、履歴はメモリに保存します（再起動で消えます）")
    return InMemoryRepository()
