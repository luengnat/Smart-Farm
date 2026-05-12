from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="GP_")

    database_url: str = "postgresql+psycopg2://growplan:growplan@localhost:5432/growplan"
    redis_url: str = "redis://localhost:6379/0"
    solver_timeout_seconds: int = 10
    solver_max_timeout_seconds: int = 30
    solver_queue_depth: int = 5
    jwt_secret: str = "dev-jwt-secret-change-in-production"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]


settings = Settings()
