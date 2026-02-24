from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    APP_NAME: str = "Maquinita Backend"
    API_V1_STR: str = "/api/v1"
    
    # Base de Datos (SQLite por defecto para desarrollo fácil)
    DATABASE_URL: str = "sqlite+aiosqlite:///./maquinita.db"
    
    # Stripe o Nayax configs (para luego)
    STRIPE_API_KEY: Optional[str] = None

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

settings = Settings()