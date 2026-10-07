import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware

import database
from catalog import router as catalog_router, seed_catalog
from database import get_db
from orders import router as orders_router
from payments import router as payments_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await seed_catalog(database.get_db())
    yield
    database.client.close()


# Create the main app without a prefix
app = FastAPI(title="Shopping en Chine API", lifespan=lifespan)


# Global exception safety net — return JSON instead of crashing the worker
@app.exception_handler(Exception)
async def _unhandled_exception_handler(request, exc):
    logger.exception("Unhandled exception")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Erreur serveur : {type(exc).__name__}"},
    )

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str


@api_router.get("/")
async def root():
    return {"message": "Shopping en Chine API is up"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate, db=Depends(get_db)):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks(db=Depends(get_db)):
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks


api_router.include_router(catalog_router)
api_router.include_router(orders_router)
api_router.include_router(payments_router)

# Include the api router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
