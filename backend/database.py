"""MongoDB connection shared by the API modules."""
import os

from motor.motor_asyncio import AsyncIOMotorClient

import settings  # noqa: F401  (loads backend/.env)

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]


def get_db():
    """FastAPI dependency. Reads the module attribute at call time so tests can swap it."""
    return db
