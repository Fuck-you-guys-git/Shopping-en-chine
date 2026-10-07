"""MongoDB connection shared by the API modules."""
import os

from motor.motor_asyncio import AsyncIOMotorClient

import settings  # noqa: F401  (loads backend/.env)

if not os.environ.get("MONGO_URL"):
    raise RuntimeError(
        "MONGO_URL is not set. Locally: copy backend/.env.example to backend/.env. "
        "On Railway: add a MongoDB service and set MONGO_URL=${{MongoDB.MONGO_URL}} on this service."
    )

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ.get("DB_NAME", "shopping_en_chine")]


def get_db():
    """FastAPI dependency. Reads the module attribute at call time so tests can swap it."""
    return db
