"""
Détection du pays par adresse IP → langue + devise.

GET /api/geo  ->  {country_code, continent_code, lang, currency, source}

Règles (demandées par le marchand) :
- Afrique               -> français + F CFA
- Europe                -> français + EUR
- USA / reste du monde  -> anglais + USD
Aucune conversion : chaque produit porte ses prix EUR/USD saisis à la main.

Robustesse (cause du bug « les clients EU/US voyaient des F CFA ») :
1. Les fournisseurs IP gratuits sont interrogés en cascade avec un budget
   total court (2 s chacun) pour rester SOUS le timeout du navigateur.
2. Le résultat est mis en cache dans MongoDB (30 jours) : le cache survit
   aux redémarrages/redéploiements et divise par ~100 les appels externes,
   ce qui évite de se faire limiter (ip-api.com = 45 req/min par serveur).
3. Si TOUS les fournisseurs échouent, on se rabat sur la région déclarée
   par le navigateur (Accept-Language, ex. « fr-FR » -> France -> EUR)
   au lieu de renvoyer aveuglément l'Afrique / F CFA.
"""
from __future__ import annotations

import ipaddress
import logging
import re
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)
router = APIRouter(tags=["geo"])

DEFAULT = {"country_code": None, "continent_code": "AF", "lang": "fr", "currency": "XOF", "source": "default"}

CACHE_TTL_DAYS = 30
PROVIDER_TIMEOUT = 2.0  # par fournisseur -> 6 s au pire pour les 3

# Cache mémoire (process courant) en plus du cache MongoDB
_cache: dict[str, dict] = {}
_CACHE_MAX = 5000

EUROPE = {
    "AD", "AL", "AT", "AX", "BA", "BE", "BG", "BY", "CH", "CY", "CZ", "DE", "DK",
    "EE", "ES", "FI", "FO", "FR", "GB", "GG", "GI", "GR", "HR", "HU", "IE", "IM",
    "IS", "IT", "JE", "LI", "LT", "LU", "LV", "MC", "MD", "ME", "MK", "MT", "NL",
    "NO", "PL", "PT", "RO", "RS", "RU", "SE", "SI", "SJ", "SK", "SM", "UA", "VA", "XK",
}
AFRICA = {
    "AO", "BF", "BI", "BJ", "BW", "CD", "CF", "CG", "CI", "CM", "CV", "DJ", "DZ",
    "EG", "EH", "ER", "ET", "GA", "GH", "GM", "GN", "GQ", "GW", "KE", "KM", "LR",
    "LS", "LY", "MA", "MG", "ML", "MR", "MU", "MW", "MZ", "NA", "NE", "NG", "RE",
    "RW", "SC", "SD", "SH", "SL", "SN", "SO", "SS", "ST", "SZ", "TD", "TG", "TN",
    "TZ", "UG", "YT", "ZA", "ZM", "ZW",
}

# En-têtes pays posés par certains CDN/ingress (gratuit et instantané si présent)
COUNTRY_HEADERS = (
    "cf-ipcountry",
    "x-vercel-ip-country",
    "x-appengine-country",
    "x-country-code",
    "x-geo-country",
)


def _db(request: Request) -> AsyncIOMotorDatabase | None:
    return getattr(request.app.state, "db", None)


def _client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        ip = fwd.split(",")[0].strip()
        if ip:
            return ip
    return request.client.host if request.client else None


def _is_public(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
        return not (addr.is_private or addr.is_loopback or addr.is_link_local)
    except ValueError:
        return False


def _result_for(country: str | None, source: str = "ip") -> dict:
    if not country:
        return DEFAULT
    country = country.upper()
    if country in AFRICA:
        return {"country_code": country, "continent_code": "AF", "lang": "fr", "currency": "XOF", "source": source}
    if country in EUROPE:
        return {"country_code": country, "continent_code": "EU", "lang": "fr", "currency": "EUR", "source": source}
    # USA et reste du monde
    return {
        "country_code": country,
        "continent_code": "NA" if country == "US" else None,
        "lang": "en",
        "currency": "USD",
        "source": source,
    }


def _country_from_headers(request: Request) -> str | None:
    """Pays fourni directement par le CDN/ingress, quand il est disponible."""
    for h in COUNTRY_HEADERS:
        v = (request.headers.get(h) or "").strip().upper()
        if len(v) == 2 and v.isalpha() and v != "XX":
            return v
    return None


def _country_from_accept_language(request: Request) -> str | None:
    """Région déclarée par le navigateur : « fr-FR,fr;q=0.9 » -> « FR ».
    Filet de sécurité quand la géolocalisation IP est indisponible."""
    header = request.headers.get("accept-language") or ""
    for tag in re.split(r"[,;]", header):
        tag = tag.strip()
        m = re.match(r"^[a-zA-Z]{2,3}-([A-Za-z]{2})$", tag)
        if m:
            return m.group(1).upper()
    return None


async def _lookup_country(ip: str) -> str | None:
    """Essaie plusieurs fournisseurs gratuits jusqu'à obtenir un code pays."""
    async with httpx.AsyncClient(timeout=PROVIDER_TIMEOUT) as client:
        # 1. ipwho.is (HTTPS)
        try:
            r = await client.get(f"https://ipwho.is/{ip}", params={"fields": "success,country_code"})
            data = r.json()
            if data.get("success") and data.get("country_code"):
                return data["country_code"]
        except Exception:
            pass
        # 2. ip-api.com (HTTP, 45 req/min par serveur)
        try:
            r = await client.get(f"http://ip-api.com/json/{ip}", params={"fields": "status,countryCode"})
            data = r.json()
            if data.get("status") == "success" and data.get("countryCode"):
                return data["countryCode"]
        except Exception:
            pass
        # 3. geojs.io (HTTPS, sans limite stricte)
        try:
            r = await client.get(f"https://get.geojs.io/v1/ip/country/{ip}.json")
            data = r.json()
            if data.get("country"):
                return data["country"]
        except Exception:
            pass
    return None


async def _cached_country(db, ip: str) -> str | None:
    if db is None:
        return None
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=CACHE_TTL_DAYS)).isoformat()
        doc = await db.geo_cache.find_one({"_id": ip, "at": {"$gte": cutoff}}, {"country": 1})
        return (doc or {}).get("country")
    except Exception:
        return None


async def _store_country(db, ip: str, country: str) -> None:
    if db is None:
        return
    try:
        await db.geo_cache.update_one(
            {"_id": ip},
            {"$set": {"country": country, "at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
    except Exception:
        pass


@router.get("/geo")
async def detect_geo(request: Request) -> dict:
    # 0. Pays donné par le CDN/ingress : gratuit, instantané, jamais limité
    hdr = _country_from_headers(request)
    if hdr:
        return _result_for(hdr, "header")

    ip = _client_ip(request)
    if not ip or not _is_public(ip):
        # Environnement local / IP privée : on tente la langue du navigateur
        lang_country = _country_from_accept_language(request)
        return _result_for(lang_country, "accept-language") if lang_country else DEFAULT

    if ip in _cache:
        return _cache[ip]

    db = _db(request)
    country = await _cached_country(db, ip)
    source = "cache"
    if not country:
        country = await _lookup_country(ip)
        source = "ip"
        if country:
            await _store_country(db, ip, country)

    if not country:
        # Tous les fournisseurs ont échoué (panne, quota, réseau) : on utilise
        # la région du navigateur plutôt que d'imposer des F CFA à un Européen.
        fallback = _country_from_accept_language(request)
        if fallback:
            logger.warning("[Geo] lookup KO pour %s -> repli Accept-Language %s", ip, fallback)
            return _result_for(fallback, "accept-language")
        logger.warning("[Geo] lookup KO pour %s -> defaut XOF", ip)
        return DEFAULT

    result = _result_for(country, source)
    if len(_cache) < _CACHE_MAX:
        _cache[ip] = result
    return result
