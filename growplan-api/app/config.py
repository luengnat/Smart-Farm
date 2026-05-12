from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://growplan:growplan@localhost:5432/growplan"
    redis_url: str = "redis://localhost:6379/0"
    solver_timeout_seconds: int = 10
    solver_max_timeout_seconds: int = 30
    solver_queue_depth: int = 5
    api_key: str = "dev-key-change-in-production"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    class Config:
        env_prefix = "GP_"


settings = Settings()
