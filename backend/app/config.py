from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    database_url: str
    jwt_secret: str
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    cors_origins: list[str] = ["http://localhost:5173"]
    failed_logins_per_minute: int = 10
    max_live_battles: int = 20
    max_simulations: int = 1
    simulation_timeout_seconds: float = 120


settings = Settings()
