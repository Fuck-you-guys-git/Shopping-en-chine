from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import JSONResponse
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

# Global exception safety net — return JSON instead of crashing the worker
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


class OrderCustomer(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: str
    address: str
    zip: str = ""
    city: str

class OrderItem(BaseModel):
    product_id: str
    name: str
    price: float = Field(ge=0)
    qty: int = Field(ge=1)

class OrderCreate(BaseModel):
    """Request body sent by the checkout page to record an order."""
    customer: OrderCustomer
    items: List[OrderItem] = Field(min_length=1)
    shipping: float = Field(default=0, ge=0)

class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field

    id: str = Field(default_factory=lambda: f"SEC-{uuid.uuid4().hex[:8].upper()}")
    customer: OrderCustomer
    items: List[OrderItem]
    subtotal: float
    shipping: float
    total: float
    currency: str = "XOF"
    payment: str = "à la livraison"  # no online payment provider is wired in
    status: str = "confirmée"  # the customer confirmed it at checkout
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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


# ---- Orders ----------------------------------------------------------------
@api_router.post("/orders", response_model=Order, status_code=201)
async def create_order(input: OrderCreate):
    # Totals are derived from the line items, never taken from the client. Item
    # prices still come from the client: the catalog lives in the frontend.
    subtotal = sum(item.price * item.qty for item in input.items)
    order = Order(
        customer=input.customer,
        items=input.items,
        subtotal=subtotal,
        shipping=input.shipping,
        total=subtotal + input.shipping,
    )
    doc = order.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    _ = await db.orders.insert_one(doc)
    return order

@api_router.get("/orders/{order_id}", response_model=Order)
async def get_order(order_id: str):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    if isinstance(order['created_at'], str):
        order['created_at'] = datetime.fromisoformat(order['created_at'])
    return order


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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
