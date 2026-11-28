from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # 未設定なら AI を呼ばずにデモの言葉を返す
    gemini_api_key: str = ""
    # カンマ区切りで複数指定可
    cors_origins: str = "http://localhost:3000"

    @field_validator("cors_origins")
    @classmethod
    def _normalize_cors_origins(cls, v: str) -> str:
        # ブラウザは末尾 / なしで Origin を送るので、設定側の / を取り除く
        return ",".join(o.strip().rstrip("/") for o in v.split(",") if o.strip())


settings = Settings()
