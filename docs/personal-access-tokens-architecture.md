# Personal Access Tokens (PAT) Architecture

This document describes the architecture for Personal Access Tokens in CityCatalyst, providing a simpler authentication alternative to OAuth 2.0 for programmatic API and MCP access.

## Overview

PATs allow users to authenticate API requests without going through the OAuth 2.0 flow. Users generate tokens in the Settings UI and use them as Bearer tokens in API requests.

**Token Format:** `cc_pat_{nanoid(32)}`

**Security Model:** Only the SHA-256 hash is stored; the plaintext token is shown once at creation.

---

## Token Creation Flow

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant UI as Settings UI
    participant API as /api/v1/user/tokens
    participant DB as Database

    User->>UI: Click "Create Token"
    User->>UI: Enter name, scopes, expiry
    UI->>API: POST {name, scopes, expiresAt}

    API->>API: Validate session (must be logged in)
    API->>API: Generate token: cc_pat_{nanoid(32)}
    API->>API: Compute SHA-256(token)
    API->>DB: INSERT PersonalAccessToken<br/>(userId, name, tokenHash, tokenPrefix, scopes, expiresAt)
    DB-->>API: Success

    API-->>UI: {token: "cc_pat_a1b2...", name, scopes, expiresAt}
    UI-->>User: Display token (one time only)<br/>"Copy now - won't be shown again"
    User->>User: Copy token to MCP client config
```

---

## Token Validation Flow

```mermaid
sequenceDiagram
    autonumber
    participant Client as MCP Client / Script
    participant API as apiHandler
    participant PAT as PAT Validator
    participant DB as Database
    participant Endpoint as /api/v1/mcp

    Client->>API: POST /api/v1/mcp<br/>Authorization: Bearer cc_pat_a1b2...

    API->>API: Extract Bearer token

    alt Token starts with "cc_pat_"
        API->>PAT: Validate PAT
        PAT->>PAT: Compute SHA-256(token)
        PAT->>DB: SELECT * FROM PersonalAccessToken<br/>WHERE tokenHash = ?

        alt Token not found
            DB-->>PAT: null
            PAT-->>API: Invalid token
            API-->>Client: 401 Unauthorized
        else Token found
            DB-->>PAT: {userId, scopes, expiresAt, ...}

            alt Token expired
                PAT-->>API: Token expired
                API-->>Client: 401 Token expired
            else Token valid
                PAT->>PAT: Check scope vs HTTP method<br/>(GET→read, POST→write)

                alt Insufficient scope
                    PAT-->>API: Insufficient scope
                    API-->>Client: 403 Forbidden
                else Scope OK
                    PAT->>DB: UPDATE lastUsedAt = NOW()
                    PAT->>DB: SELECT * FROM User WHERE userId = ?
                    DB-->>PAT: User record
                    PAT->>PAT: Build AppSession {user, role}
                    PAT-->>API: AppSession
                    API->>Endpoint: Forward request + session
                    Endpoint-->>API: Response
                    API-->>Client: 200 OK + data
                end
            end
        end
    else JWT token (existing OAuth flow)
        API->>API: Existing OAuth validation
    else Session cookie
        API->>API: Existing NextAuth validation
    end
```

---

## Database Schema

```mermaid
erDiagram
    User {
        UUID userId PK
        string name
        string email UK
        string passwordHash
        enum role "admin | user"
        string pictureUrl
        string preferredLanguage
        datetime created
        datetime lastUpdated
    }

    PersonalAccessToken {
        UUID id PK
        UUID userId FK
        string name "e.g. Claude Desktop"
        string tokenHash UK "SHA-256, 64 chars"
        string tokenPrefix "first 8 chars for display"
        string[] scopes "read, write"
        datetime expiresAt "null = never"
        datetime lastUsedAt "null = never used"
        datetime created
    }

    User ||--o{ PersonalAccessToken : "has many"
```

### Field Details

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `userId` | UUID | Foreign key to User |
| `name` | string | User-provided label (e.g., "Claude Desktop", "CI/CD Pipeline") |
| `tokenHash` | string(64) | SHA-256 hash of the full token, unique index |
| `tokenPrefix` | string(8) | First 8 characters of token for display/identification |
| `scopes` | string[] | Permissions: `["read"]`, `["write"]`, or `["read", "write"]` |
| `expiresAt` | datetime | Token expiration; null means never expires |
| `lastUsedAt` | datetime | Last successful authentication; null if never used |
| `created` | datetime | Token creation timestamp |

---

## MCP Client Configuration

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or equivalent:

```json
{
  "mcpServers": {
    "citycatalyst": {
      "url": "https://app.citycatalyst.io/api/v1/mcp",
      "headers": {
        "Authorization": "Bearer cc_pat_your_token_here"
      }
    }
  }
}
```

### Cursor

In Cursor settings, add MCP server with:
- **URL:** `https://app.citycatalyst.io/api/v1/mcp`
- **Headers:** `Authorization: Bearer cc_pat_your_token_here`

### cURL / Scripts

```bash
curl -X POST https://app.citycatalyst.io/api/v1/mcp \
  -H "Authorization: Bearer cc_pat_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

### Python

```python
import requests

PAT = "cc_pat_your_token_here"
BASE_URL = "https://app.citycatalyst.io/api/v1/mcp"

response = requests.post(
    BASE_URL,
    headers={
        "Authorization": f"Bearer {PAT}",
        "Content-Type": "application/json"
    },
    json={
        "jsonrpc": "2.0",
        "method": "tools/list",
        "id": 1
    }
)
print(response.json())
```

---

## API Endpoints

### Token Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/user/tokens` | List user's tokens (excludes hash, shows prefix) |
| `POST` | `/api/v1/user/tokens` | Create new token |
| `DELETE` | `/api/v1/user/tokens/:id` | Revoke/delete a token |

### Create Token Request

```json
POST /api/v1/user/tokens
Content-Type: application/json

{
  "name": "Claude Desktop",
  "scopes": ["read", "write"],
  "expiresAt": "2025-12-31T23:59:59Z"  // optional, null = never
}
```

### Create Token Response

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "token": "cc_pat_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",  // Only shown once!
  "name": "Claude Desktop",
  "tokenPrefix": "cc_pat_a",
  "scopes": ["read", "write"],
  "expiresAt": "2025-12-31T23:59:59Z",
  "created": "2024-01-15T10:30:00Z"
}
```

### List Tokens Response

```json
{
  "tokens": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Claude Desktop",
      "tokenPrefix": "cc_pat_a",
      "scopes": ["read", "write"],
      "expiresAt": "2025-12-31T23:59:59Z",
      "lastUsedAt": "2024-01-20T14:22:00Z",
      "created": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

## Scope Mapping

| HTTP Method | Required Scope | Description |
|-------------|----------------|-------------|
| `GET` | `read` | Read-only operations |
| `POST` | `write` | Write operations (MCP tool calls that modify data) |
| `PUT` | `write` | Update operations |
| `DELETE` | `write` | Delete operations |

**Note:** MCP `tools/list` requires `read` scope. Most MCP tool calls (e.g., `get_user_cities`) also only require `read` since they query data.

---

## Security Considerations

1. **Hash-only storage:** Never store plaintext tokens; only SHA-256 hashes
2. **One-time display:** Token shown only at creation; cannot be retrieved later
3. **Prefix for identification:** Store first 8 chars to help users identify tokens in the UI
4. **Scope restriction:** Tokens can have limited scopes (read-only vs read-write)
5. **Expiration:** Support both expiring and non-expiring tokens
6. **Audit trail:** Track `lastUsedAt` for security monitoring
7. **Easy revocation:** Users can delete tokens anytime from Settings UI

---

## Implementation Files

| Component | File Path |
|-----------|-----------|
| PAT Validator | `app/src/lib/auth/pat-validator.ts` (to be created) |
| API Handler Integration | `app/src/util/api.ts` (modify) |
| Token Management API | `app/src/app/api/v1/user/tokens/route.ts` (to be created) |
| Database Model | `app/src/models/PersonalAccessToken.ts` (to be created) |
| Database Migration | `app/migrations/YYYYMMDD-personal-access-tokens.cjs` (to be created) |
| Settings UI | `app/src/app/[lng]/settings/tokens/page.tsx` (to be created) |

---

## Authentication Flow Priority

When processing a request, the `apiHandler` checks authentication in this order:

1. **Session cookie** (NextAuth) - Browser-based users
2. **Bearer token starting with `cc_pat_`** - Personal Access Token
3. **Bearer JWT token** - OAuth 2.0 access token
4. **Service headers** (`X-Service-Name`, `X-Service-Key`) - Internal services

This allows PATs to coexist with existing OAuth and session authentication.
