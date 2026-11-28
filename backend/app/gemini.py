"""Gemini への接続。どのモデルをどう呼ぶかは、使う側（mindmap.py）で決める。"""

from google import genai

from .config import settings

# このステータスのときは次のモデルで再試行する（混雑・回数制限・モデル提供終了・時間切れ）
RETRYABLE_CODES = {404, 429, 500, 503, 504}

_client: genai.Client | None = None


class GeminiUnavailableError(Exception):
    """すべてのモデルで生成に失敗した。"""


def get_client() -> genai.Client:
    """APIキーを読んで、Gemini のクライアントを1つだけ作って使い回す。"""
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client
