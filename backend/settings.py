"""Settings read from the environment (backend/.env)."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")


def paxity_org_id() -> str:
    """Paxity organization id for the checkout widget. Empty disables online payment."""
    return os.environ.get("PAXITY_ORG_ID", "").strip()


def admin_credentials() -> tuple[str, str] | None:
    """Seller-area login (ADMIN_EMAIL / ADMIN_PASSWORD). None disables the seller area."""
    email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("ADMIN_PASSWORD", "")
    return (email, password) if email and password else None


def admin_name() -> str:
    return os.environ.get("ADMIN_NAME", "").strip() or "Propriétaire"
