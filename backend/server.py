from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="Shopping en Chine API")

# Make db reachable from routers via request.app.state.db
app.state.db = db

# Global exception safety net — return JSON instead of crashing the worker
# (prevents Cloudflare 520/521 in front of our origin)
from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def _unhandled_exception_handler(request, exc):
    logging.getLogger(__name__).exception("Unhandled exception")
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
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks


# ---- Paxity payment gateway ---------------------------------------------
from paxity_router import router as paxity_router
api_router.include_router(paxity_router)

# ---- Order tracking (Où est mon colis ?) ---------------------------------
from tracking_router import router as tracking_router
api_router.include_router(tracking_router)

# ---- Seller auth + product catalog ---------------------------------------
from auth_router import router as auth_router, seed_seller
from products_router import router as products_router, seed_products
api_router.include_router(auth_router)
api_router.include_router(products_router)

# Include the api router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup_seed():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.products.create_index("id", unique=True)
    await seed_seller(db)
    await seed_products(db)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
