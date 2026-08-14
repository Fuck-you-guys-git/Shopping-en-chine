"""
Détection du pays par adresse IP → langue + devise suggérées.

GET /api/geo  ->  {country_code, continent_code, lang, currency}

Règles (demandées par le marchand) :
- Europe          -> français + EUR (1 EUR = 800 F CFA)
- Afrique         -> français + F CFA
- USA / reste du monde -> anglais + USD (1 USD = 750 F CFA)
Le client peut toujours changer manuellement via le sélecteur drapeaux.

Fournisseurs interrogés en cascade (gratuits, pas de clé requise) :
ipwho.is -> ip-api.com -> geojs.io. Le continent est déduit du code pays
via des ensembles statiques (fiable quel que soit le fournisseur).
"""
from __future__ import annotations

import ipaddress
import logging

import httpx
from fastapi import APIRouter, Request

logger = logging.getLogger(__name__)
router = APIRouter(tags=["geo"])

DEFAULT = {"country_code": None, "continent_code": "AF", "lang": "fr", "currency": "XOF"}

# Petit cache mémoire pour ne pas re-interroger les API géo à chaque visite
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


def _result_for(country: str | None) -> dict:
    if not country:
        return DEFAULT
    country = country.upper()
    if country in AFRICA:
        return {"country_code": country, "continent_code": "AF", "lang": "fr", "currency": "XOF"}
    if country in EUROPE:
        return {"country_code": country, "continent_code": "EU", "lang": "fr", "currency": "EUR"}
    # USA et reste du monde
    return {"country_code": country, "continent_code": "NA" if country == "US" else None, "lang": "en", "currency": "USD"}


async def _lookup_country(ip: str) -> str | None:
    """Essaie plusieurs fournisseurs gratuits jusqu'à obtenir un code pays."""
    async with httpx.AsyncClient(timeout=4) as client:
        # 1. ipwho.is (HTTPS)
        try:
            r = await client.get(f"https://ipwho.is/{ip}", params={"fields": "success,country_code"})
            data = r.json()
            if data.get("success") and data.get("country_code"):
                return data["country_code"]
        except Exception:
            pass
        # 2. ip-api.com (HTTP, 45 req/min)
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


@router.get("/geo")
async def detect_geo(request: Request) -> dict:
    ip = _client_ip(request)
    if not ip or not _is_public(ip):
        return DEFAULT
    if ip in _cache:
        return _cache[ip]
    country = await _lookup_country(ip)
    if not country:
        logger.warning("[Geo] lookup failed for %s", ip)
        return DEFAULT
    result = _result_for(country)
    if len(_cache) < _CACHE_MAX:
        _cache[ip] = result
    return result
