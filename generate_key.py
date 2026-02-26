import asyncio
import hashlib
import secrets
import uuid
import sys
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.db.models import ApiKey

async def generate_api_key(name: str, scopes: list[str], rate_limit: int = 60):
    # Generate a secure random key
    raw_key = f"de_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Create a new API key entry
        new_key = ApiKey(
            id=uuid.uuid4(),
            key_hash=key_hash,
            name=name,
            scopes=scopes,
            rate_limit=rate_limit,
            is_active=True,
            created_at=datetime.now(timezone.utc)
        )
        
        session.add(new_key)
        await session.commit()
        
        print("\n" + "="*50)
        print("🚀 NEW API KEY GENERATED")
        print("="*50)
        print(f"Name:       {name}")
        print(f"Scopes:     {', '.join(scopes)}")
        print(f"Rate Limit: {rate_limit} req/min")
        print("-"*50)
        print(f"API KEY:    {raw_key}")
        print("-"*50)
        print("⚠️  SAVE THIS KEY NOW! It is not stored in plain text.")
        print("="*50 + "\n")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate a new API key for Distill.")
    parser.add_argument("--name", type=str, default="Manual Test Key", help="Name for the API key")
    parser.add_argument("--scopes", type=str, default="scrape,map,search,agent", help="Comma-separated list of scopes")
    parser.add_argument("--limit", type=int, default=100, help="Rate limit per minute")

    args = parser.parse_args()
    
    scopes_list = [s.strip() for s in args.scopes.split(",")]
    
    try:
        asyncio.run(generate_api_key(args.name, scopes_list, args.limit))
    except Exception as e:
        print(f"❌ Error generating key: {e}")
        print("Make sure your PostgreSQL database is running and accessible.")
