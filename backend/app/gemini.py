from google import genai

from .config import settings

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


def generate(prompt: str) -> str:
    """Geminiで解説を生成する。APIキー未設定時はデモ用の固定文を返す。"""
    if not settings.gemini_api_key:
        return (
            "【デモモード】GEMINI_API_KEY が未設定のため固定の文章を返しています。\n"
            "backend/.env に GEMINI_API_KEY を設定すると実際の解説が生成されます。"
        )
    response = _get_client().models.generate_content(model=settings.gemini_model, contents=prompt)
    return response.text or ""
