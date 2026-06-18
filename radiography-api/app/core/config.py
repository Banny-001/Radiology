from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_ENV: str = "development"
    SECRET_KEY: str = "dev-secret-key"
    ALLOWED_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/radiography_db"
    PACS_AE_TITLE: str = "RADIOGRAPHY"
    PACS_HOST: str = "0.0.0.0"
    PACS_PORT: int = 4242
    DICOM_STORAGE_PATH: str = "./dicom_storage"
    ANTHROPIC_API_KEY: str = ""

    @property
    def is_dev(self) -> bool:
        return self.APP_ENV == "development"


settings = Settings()