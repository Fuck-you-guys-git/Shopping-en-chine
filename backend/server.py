from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
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

# Compression des réponses (catalogue avec images base64 → chargement bien plus rapide)
app.add_middleware(GZipMiddleware, minimum_size=1024)

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

# ---- Stripe card payments -------------------------------------------------
from stripe_router import router as stripe_router
api_router.include_router(stripe_router)

# Géolocalisation IP -> langue + devise (Europe EUR, Afrique FCFA, USA USD)
from geo_router import router as geo_router
api_router.include_router(geo_router)

# ---- Seller orders (real customer orders) ---------------------------------
from orders_router import router as orders_router
api_router.include_router(orders_router)

# ---- Seller auth + product catalog ---------------------------------------
from auth_router import router as auth_router, seed_seller
from products_router import router as products_router, seed_products, migrate_base64_images, freeze_localized_prices
api_router.include_router(auth_router)
api_router.include_router(products_router)

# ---- Journal des emails + webhook de livraison Resend ---------------------
from emails_router import router as emails_router
api_router.include_router(emails_router)

# ---- Avis clients vérifiés -------------------------------------------------
from reviews_router import router as reviews_router
api_router.include_router(reviews_router)

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
    # Fige les prix EUR/USD affichés (fin de la conversion automatique)
    await freeze_localized_prices(db)
    await db.product_images.create_index([("product_id", 1), ("image_id", 1)])
    # Cart-abandonment recovery loop (checks every 30 min)
    import asyncio
    asyncio.create_task(_recovery_loop())
    # Rattrapage durable des paiements Paxity restés « en attente » : rend la
    # confirmation (et les emails) indépendante de l'IPN, du retour navigateur
    # et des redéploiements. Sans cette boucle, une commande réellement payée
    # pouvait rester « pending » pour toujours → aucun email envoyé.
    from paxity_router import reconciliation_loop
    asyncio.create_task(reconciliation_loop(db))
    # Migration en arrière-plan : photos base64 → URLs légères + miniatures
    asyncio.create_task(migrate_base64_images(db))


async def _recovery_loop():
    """Relance panier : 2 fois par semaine maximum (tous les ~3,5 jours),
    pendant 3 mois maximum. Abandon automatique si le client a finalement
    passé une commande payée, ou après ~26 relances (2/semaine × 13 semaines)."""
    import asyncio
    from datetime import timedelta
    from email_service import send_recovery_email
    while True:
        try:
            now = datetime.now(timezone.utc)
            oldest = (now - timedelta(days=90)).isoformat()   # abandon après 3 mois
            newest = (now - timedelta(hours=1)).isoformat()   # laisse 1 h pour payer
            resend_cutoff = (now - timedelta(days=3, hours=12)).isoformat()  # 2×/semaine
            candidates = await db.orders.find({
                "status": {"$in": ["pending", "failed"]},
                "customer.email": {"$nin": [None, ""]},
                "is_test": {"$ne": True},
                "created_at": {"$gte": oldest, "$lte": newest},
                "recovery_count": {"$not": {"$gte": 26}},
                "$or": [
                    {"recovery_email_at": {"$exists": False}},
                    {"recovery_email_at": {"$lte": resend_cutoff}},
                ],
            }, {"_id": 0}).to_list(20)
            for order in candidates:
                email = (order.get("customer") or {}).get("email")
                # Le client a fini par commander (payé) après ce panier → on abandonne
                converted = await db.orders.find_one({
                    "customer.email": email,
                    "status": "success",
                    "created_at": {"$gte": order.get("created_at", "")},
                }, {"_id": 1})
                if converted:
                    await db.orders.update_one(
                        {"id": order["id"]}, {"$set": {"recovery_count": 26}})
                    continue
                # Claim atomique : jamais de double envoi (redémarrages/répliques)
                claimed = await db.orders.find_one_and_update(
                    {"id": order["id"], "$or": [
                        {"recovery_email_at": {"$exists": False}},
                        {"recovery_email_at": {"$lte": resend_cutoff}},
                    ]},
                    {"$set": {"recovery_email_sent": True,
                              "recovery_email_at": now.isoformat()},
                     "$inc": {"recovery_count": 1}},
                )
                if claimed:
                    await send_recovery_email(db, order)
        except Exception:
            logger.exception("[Recovery] loop iteration failed")
        await asyncio.sleep(1800)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
