from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "视频片段标注平台"
    app_env: str = "development"
    app_timezone: str = "Asia/Shanghai"
    app_origins: str = (
        "http://localhost:8080,http://localhost:5173,"
        "http://127.0.0.1:8080,http://127.0.0.1:5173"
    )
    database_url: str = "postgresql+psycopg://app:app@localhost:5432/app"
    storage_dir: str = "./storage/videos"
    session_secret: str = "dev-only-change-me"
    session_cookie_secure: bool = False
    max_upload_bytes: int = 2 * 1024 * 1024 * 1024
    transcode_to_h264: bool = False
    demo_mode: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def origins(self) -> list[str]:
        return [item.strip() for item in self.app_origins.split(",") if item.strip()]

    @property
    def storage_path(self) -> Path:
        path = Path(self.storage_dir)
        if path.is_absolute():
            return path
        # backend/app/core/config.py -> project root
        return (Path(__file__).resolve().parents[3] / path).resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
