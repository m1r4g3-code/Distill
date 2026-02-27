import pytest
import httpx
from app.config import settings
from app.db.models import ApiKey
from sqlalchemy import select

@pytest.mark.asyncio
async def test_admin_requires_key(client: httpx.AsyncClient):
    response = await client.get("/api/v1/admin/keys")
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_admin_create_and_list_keys(client: httpx.AsyncClient, db_session):
    # 1. Create a Key
    create_resp = await client.post(
        "/api/v1/admin/keys",
        headers={"X-Admin-Key": settings.admin_key},
        json={"name": "Test Key", "rate_limit": 100}
    )
    assert create_resp.status_code == 200
    data = create_resp.json()
    assert data["name"] == "Test Key"
    assert data["rate_limit"] == 100
    assert "raw_key" in data
    key_id = data["id"]
    
    # Check DB
    result = await db_session.execute(select(ApiKey).where(ApiKey.id == key_id))
    api_key = result.scalar_one()
    assert api_key is not None
    assert api_key.name == "Test Key"

    # 2. List Keys
    list_resp = await client.get(
        "/api/v1/admin/keys",
        headers={"X-Admin-Key": settings.admin_key}
    )
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert len(list_data) >= 1
    assert any(k["id"] == key_id for k in list_data)

    # 3. Update Key (PATCH)
    patch_resp = await client.patch(
        f"/api/v1/admin/keys/{key_id}",
        headers={"X-Admin-Key": settings.admin_key},
        json={"name": "Updated Key", "rate_limit": 500}
    )
    assert patch_resp.status_code == 200
    patch_data = patch_resp.json()
    assert patch_data["name"] == "Updated Key"
    assert patch_data["rate_limit"] == 500
    
    # Verify DB Update
    await db_session.refresh(api_key)
    assert api_key.name == "Updated Key"
    assert api_key.rate_limit == 500

    # 4. Revoke Key
    revoke_resp = await client.delete(
        f"/api/v1/admin/keys/{key_id}",
        headers={"X-Admin-Key": settings.admin_key}
    )
    assert revoke_resp.status_code == 204
    
    # Verify Revoked
    await db_session.refresh(api_key)
    assert api_key.is_active is False
