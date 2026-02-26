import asyncio
import hashlib
import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.db.models import ApiKey

# The key we want to use for "normal" testing
TEST_KEY = "test-integration-key"
KEY_HASH = hashlib.sha256(TEST_KEY.encode("utf-8")).hexdigest()

async def seed_api_key():
    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Check if the key already exists
        from sqlalchemy import select
        result = await session.execute(select(ApiKey).where(ApiKey.key_hash == KEY_HASH))
        existing_key = result.scalar_one_or_none()
        
        if existing_key:
            print(f"API key '{TEST_KEY}' already exists in the database.")
            return

        # Create a new API key
        new_key = ApiKey(
            id=uuid.uuid4(),
            key_hash=KEY_HASH,
            name="Integration Test Key",
            scopes=["scrape", "map", "search"],
            rate_limit=1000,
            is_active=True,
            created_at=datetime.now(timezone.utc)
        )
        
        session.add(new_key)
        await session.commit()
        print(f"Successfully seeded API key '{TEST_KEY}' into the database.")

if __name__ == "__main__":
    try:
        asyncio.run(seed_api_key())
    except Exception as e:
        print(f"Error seeding database: {e}")
        print("Make sure your PostgreSQL database is running and accessible at " + settings.database_url)
