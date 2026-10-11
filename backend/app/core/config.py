from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def normalize_postgres_url(cls, value: str) -> str:
        if not isinstance(value, str):
            return value

        for prefix in (
            "postgres://",
            "postgresql://",
            "postgresql+psycopg://",
            "postgresql+psycopg2://",
        ):
            if value.startswith(prefix):
                value = "postgresql+asyncpg://" + value[len(prefix):]
                break

        from sqlalchemy.engine import make_url

        url = make_url(value)
        if not url.drivername.startswith("postgresql"):
            return value

        # SQLAlchemy forwards URL query values as asyncpg.connect() keyword
        # arguments. Keep only options accepted by asyncpg or its SQLAlchemy dialect.
        supported_query_options = {
            "ssl",
            "direct_tls",
            "timeout",
            "command_timeout",
            "statement_cache_size",
            "max_cached_statement_lifetime",
            "max_cacheable_statement_size",
            "target_session_attrs",
            "krbsrvname",
            "gsslib",
            "prepared_statement_cache_size",
        }
        original_query = dict(url.query)
        query = {
            key: option
            for key, option in original_query.items()
            if key in supported_query_options
        }

        sslmode = original_query.get("sslmode")
        if sslmode is not None:
            query.setdefault("ssl", sslmode)

        return url.set(
            drivername="postgresql+asyncpg",
            query=query,
        ).render_as_string(hide_password=False)
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    CLOUDINARY_FOLDER: str = "auction-images"
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )


settings = Settings()
