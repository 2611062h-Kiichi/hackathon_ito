from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    supabase_url: str = ""
    supabase_key: str = ""
    # カンマ区切りで複数指定可
    cors_origins: str = "http://localhost:3000"
    # 1セッションあたりのAI解説回数の上限（初回を含む）
    max_explanations_per_session: int = 3


settings = Settings()
