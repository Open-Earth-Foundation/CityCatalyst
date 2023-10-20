from pydantic_settings import BaseSettings
from pydantic import root_validator
import os

class Settings(BaseSettings):
    PROJECT_NAME: str
    DB_NAME: str
    DB_USER: str
    DB_PASSWORD: str
    DB_HOST: str
    DB_PORT: int

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @root_validator(pre=True)
    def override_settings_from_env(cls, values):
        for key in values:
            env_key = key.upper()
            if os.environ.get(env_key):
                values[key] = os.environ.get(env_key)
        return values

settings = Settings()
