from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    # メインのモデルが混雑・利用不可のときに順に試すモデル（カンマ区切り）
    gemini_fallback_models: str = "gemini-3.5-flash,gemini-3.5-flash-lite"
    supabase_url: str = ""
    supabase_key: str = ""
    # カンマ区切りで複数指定可
    cors_origins: str = "http://localhost:3000"
    # 1セッションあたりのAI解説回数の上限（初回を含む）
    max_explanations_per_session: int = 3

    @field_validator("supabase_url")
    @classmethod
    def _normalize_supabase_url(cls, v: str) -> str:
        # Data API の URL（…/rest/v1）や末尾の / をコピーしてしまっても動くようにする
        v = v.strip().rstrip("/")
        return v.removesuffix("/rest/v1")

    @field_validator("cors_origins")
    @classmethod
    def _normalize_cors_origins(cls, v: str) -> str:
        # ブラウザは末尾 / なしで Origin を送るので、設定側の / を取り除く
        return ",".join(o.strip().rstrip("/") for o in v.split(",") if o.strip())


settings = Settings()
