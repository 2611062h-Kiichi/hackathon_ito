import logging
from collections.abc import Callable

from google import genai
from google.genai import errors, types
from pydantic import BaseModel

from .config import settings

logger = logging.getLogger(__name__)

# このステータスのときは次のモデルで再試行する（混雑・回数制限・モデル提供終了）
RETRYABLE_CODES = {404, 429, 500, 503}

_client: genai.Client | None = None


class GeminiUnavailableError(Exception):
    """すべてのモデルで生成に失敗した。"""


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


def _models() -> list[str]:
    fallbacks = [m.strip() for m in settings.gemini_fallback_models.split(",") if m.strip()]
    return [settings.gemini_model, *[m for m in fallbacks if m != settings.gemini_model]]


def _with_fallback[T](call: Callable[[str], T]) -> T:
    """メインのモデルが混雑などで使えないときは、フォールバックのモデルを順に試す。"""
    last_error: errors.APIError | None = None
    for model in _models():
        try:
            return call(model)
        except errors.APIError as e:
            if e.code not in RETRYABLE_CODES:
                raise
            logger.warning("Gemini %s が利用できないため次のモデルを試します: %s %s", model, e.code, e.status)
            last_error = e
    raise GeminiUnavailableError("AIが混み合っています。少し時間をおいてもう一度お試しください。") from last_error


def generate(prompt: str) -> str:
    """Geminiで解説を生成する。APIキー未設定時はデモ用の固定文を返す。"""
    if not settings.gemini_api_key:
        return (
            "【デモモード】GEMINI_API_KEY が未設定のため固定の文章を返しています。\n"
            "backend/.env に GEMINI_API_KEY を設定すると実際の解説が生成されます。"
        )

    def call(model: str) -> str:
        response = _get_client().models.generate_content(model=model, contents=prompt)
        return response.text or ""

    return _with_fallback(call)


def generate_structured[M: BaseModel](prompt: str, schema: type[M]) -> M:
    """決まった形式（JSON）で生成させる。APIキー未設定時は呼び出し側で扱うこと。"""
    config = types.GenerateContentConfig(response_mime_type="application/json", response_schema=schema)

    def call(model: str) -> M:
        response = _get_client().models.generate_content(model=model, contents=prompt, config=config)
        if isinstance(response.parsed, schema):
            return response.parsed
        return schema.model_validate_json(response.text or "")

    return _with_fallback(call)
