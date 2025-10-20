# Climate Advisor - CityCatalyst Integration Quick Reference

## For Developers

### Extracting Token from Thread

```python
from climate_advisor.services.thread_service import ThreadService

# Get thread
thread = await thread_service.get_thread_for_user(thread_id, user_id)

# Extract token
token = thread.get_access_token()
user_id = thread.user_id  # Also needed for tools

if not token:
    logger.warning("No token available for inventory queries")
    return
```

### Making Authenticated Requests to CC

```python
from climate_advisor.services.citycatalyst_client import CityCatalystClient

client = CityCatalystClient()

# GET request (auto-refreshes token on 401)
response = await client.get_with_auto_refresh(
    url="http://cc-backend.local/api/v0/inventory/emissions-factors",
    token=token,
    user_id=user_id,
    thread_id=thread_id,
)

# POST request
response = await client.post_with_auto_refresh(
    url="http://cc-backend.local/api/v0/inventory/query",
    token=token,
    user_id=user_id,
    thread_id=thread_id,
    json_data={"query": "scope_1"}
)

if response.status_code == 200:
    data = response.json()
```

### Checking Token Expiry

```python
from climate_advisor.utils.token_manager import (
    is_token_expired,
    get_token_expiry,
    redact_token,
)

# Check if expired (includes 60-second buffer)
if is_token_expired(token):
    logger.info("Token expired: %s", redact_token(token))
    # Token will be auto-refreshed by CityCatalystClient

# Get expiry time
expiry = get_token_expiry(token)
print(f"Token expires at: {expiry}")
```

### Using CC Inventory Tools

```python
import json
from agents.tool import ToolContext
from climate_advisor.tools import CCInventoryTool, build_cc_inventory_tools

inventory_tool = CCInventoryTool()
tools, token_ref = build_cc_inventory_tools(
    inventory_tool=inventory_tool,
    access_token=thread.get_access_token(),
    user_id=thread.user_id,
    thread_id=thread.thread_id,
)

get_inventory = tools[0]  # FunctionTool named "get_inventory"
context = ToolContext(context=None, tool_call_id="dev-test")

payload = json.dumps({"inventory_id": "inv-123"})
result_json = await get_inventory.on_invoke_tool(context, payload)
result = json.loads(result_json)

if result["success"]:
    print(result["data"])  # InventoryResponse object
else:
    print(f"Query failed: {result.get('error_code')}: {result.get('error')}")

# When CA emits a refreshed token, update token_ref so future calls use it
token_ref["value"] = result.get("refreshed_token", token_ref["value"])
```

### Logging with Token Redaction

```python
from climate_advisor.utils.token_manager import redact_token, LogSafeFormatter

# ✓ GOOD - Redacted
logger.debug("Using token: %s", redact_token(token))

# ✓ GOOD - Automatic redaction
safe_msg = LogSafeFormatter.redact_tokens(f"Authorization: Bearer {token}")
logger.info(safe_msg)

# ✗ BAD - Full token exposed
logger.debug(f"Using token: {token}")  # NEVER DO THIS
```

### Updating Token After Refresh

```python
from climate_advisor.services.thread_service import ThreadService

service = ThreadService(session)
await service.update_access_token(thread, fresh_token)
await session.commit()
```

## Configuration

### Development

```bash
export CC_BASE_URL=http://localhost:3000
export CA_LOG_LEVEL=debug
```

### Production

```bash
export CC_BASE_URL=https://cc-backend.production.example.com
export CA_LOG_LEVEL=info
export CA_DATABASE_POOL_SIZE=20
```

## Common Patterns

### Pattern 1: Query Inventory in Tool

```python
async def query_emissions_factors(user_id: str, token: str, thread_id: UUID):
    """Query user's emissions factors from CityCatalyst."""
    from climate_advisor.services.citycatalyst_client import CityCatalystClient
    from climate_advisor.config import get_settings

    client = CityCatalystClient()
    settings = get_settings()

    try:
        response = await client.get_with_auto_refresh(
            url=f"{settings.cc_base_url}/api/v0/inventory/emissions-factors",
            token=token,
            user_id=user_id,
            thread_id=thread_id,
        )
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error("Failed to query emissions factors: %s", e)
        return None
```

### Pattern 2: Create Tool with Token Access

```python
class MyInventoryTool:
    def __init__(self, token: str, user_id: str, thread_id: UUID):
        self.token = token
        self.user_id = user_id
        self.thread_id = thread_id
        self.client = CityCatalystClient()

    async def query(self, query_type: str):
        # Token available for authenticated requests
        return await self.client.get_with_auto_refresh(...)
```

### Pattern 3: Handle Missing Token

```python
def get_token_or_warn(thread) -> Optional[str]:
    """Extract token, log if missing."""
    token = thread.get_access_token()
    if not token:
        logger.warning("No CC token available for user=%s", thread.user_id)
    return token
```

## Error Handling

### Token Errors

```python
from climate_advisor.services.citycatalyst_client import TokenRefreshError

try:
    fresh_token = await client.refresh_token(token, user_id, thread_id)
except TokenRefreshError as e:
    logger.error("Token refresh failed: %s", e)
    # Fall back to using expired token or return error to user
```

### API Errors

```python
from climate_advisor.services.citycatalyst_client import CityCatalystClientError

try:
    response = await client.get_with_auto_refresh(...)
except CityCatalystClientError as e:
    logger.error("API request failed: %s", e)
    # Return error to user
```

## Testing Tokens

### Generate Test Token

```python
import json
import base64
from datetime import datetime, timedelta, timezone

def create_test_jwt(user_id: str, hours: int = 24):
    """Create a test JWT token (header.payload.signature)."""
    # Header
    header = {"alg": "HS256", "typ": "JWT"}

    # Payload
    exp = datetime.now(timezone.utc) + timedelta(hours=hours)
    payload = {
        "sub": user_id,
        "scope": ["inventory:read"],
        "iss": "http://localhost:3000",
        "aud": "climate-advisor",
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "exp": int(exp.timestamp()),
    }

    # Encode (without signature for testing)
    h = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip('=')
    p = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip('=')

    return f"{h}.{p}.test-signature"

token = create_test_jwt("user123")
print(token)
```

### Verify Token

```python
from climate_advisor.utils.token_manager import parse_jwt_claims

claims = parse_jwt_claims(token)
print(claims)  # {'sub': 'user123', 'exp': ..., ...}
```

## Debugging

### Check Token Status

```bash
# In Python
from climate_advisor.utils.token_manager import *

token = "your-token-here"
print(f"Expired: {is_token_expired(token)}")
print(f"Expiry: {get_token_expiry(token)}")
print(f"Subject: {get_token_subject(token)}")
print(f"Redacted: {redact_token(token)}")
```

### Monitor Logs

```bash
# Tail logs with token redaction visible
tail -f service.log | grep "token"

# Should show redacted tokens, never full tokens
# ✓ Good: "Token refresh: eyJhbGc...RlXJ1"
# ✗ Bad: "Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Test CC Endpoint

```bash
# Check if CC base URL is reachable
curl -v http://localhost:3000/api/v0/assistants/token-refresh

# Test token refresh (if CC running)
curl -X POST http://localhost:3000/api/v0/assistants/token-refresh \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test-user","thread_id":"thread-123"}'
```

## Key Files

| File                                  | Purpose                             |
| ------------------------------------- | ----------------------------------- |
| `app/utils/token_manager.py`          | Token utilities (expiry, redaction) |
| `app/services/citycatalyst_client.py` | HTTP client for CC                  |
| `app/tools/cc_inventory_tool.py`      | CC inventory tool facade            |
| `app/tools/cc_inventory_wrappers.py`  | Agents function wrappers            |
| `app/routes/messages.py`              | Token extraction in message handler |
| `app/models/db/thread.py`             | `get_access_token()` method         |
| `app/services/thread_service.py`      | `update_access_token()` method      |

## Documentation Files

| File                        | Content                         |
| --------------------------- | ------------------------------- |
| `CC-CA-INTEGRATION.md`      | Comprehensive integration guide |
| `INTEGRATION_TEST_GUIDE.md` | Manual testing procedures       |
| `IMPLEMENTATION_SUMMARY.md` | Implementation overview         |
| `QUICK_REFERENCE.md`        | This file                       |

## Common Commands

```bash
# Start CA service
cd climate-advisor/service && python -m uvicorn app.main:app --host 0.0.0.0 --port 8080

# Run tests
python -m pytest tests/ -v

# Check token validity
python -c "from climate_advisor.utils.token_manager import *; \
  print(is_token_expired('TOKEN_HERE'))"

# Query database
psql postgresql://climateadvisor:climateadvisor@localhost:5432/climateadvisor \
  -c "SELECT thread_id, context->>'access_token' FROM threads LIMIT 5"
```

---

**For more details, see:**

- Main guide: `CC-CA-INTEGRATION.md`
- Testing: `INTEGRATION_TEST_GUIDE.md`
- Implementation: `IMPLEMENTATION_SUMMARY.md`
