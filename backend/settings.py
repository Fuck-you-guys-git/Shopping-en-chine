"""Settings read from the environment (backend/.env)."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")


def paxity_org_id() -> str:
    """Paxity organization id for the checkout widget. Empty disables online payment."""
    return os.environ.get("PAXITY_ORG_ID", "").strip()
