# Personal Access Tokens Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement Personal Access Tokens (PAT) for CityCatalyst to enable simpler programmatic API/MCP access without OAuth.

**Architecture:** PATs are Bearer tokens with format `cc_pat_{nanoid(32)}`. Only SHA-256 hashes are stored. Tokens are validated in `apiHandler` before OAuth/session checks. User manages tokens via REST API.

**Tech Stack:** Sequelize (PostgreSQL), Next.js API routes, nanoid, crypto (SHA-256)

---

## Task 1: Create Database Migration

**Files:**
- Create: `app/migrations/20260202000000-personal-access-tokens.cjs`

**Step 1: Write the migration file**

```javascript
"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("PersonalAccessToken", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "User",
          key: "user_id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      token_hash: {
        type: Sequelize.CHAR(64),
        allowNull: false,
        unique: true,
      },
      token_prefix: {
        type: Sequelize.STRING(16),
        allowNull: false,
      },
      scopes: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: false,
        defaultValue: ["read"],
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_used_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      last_updated: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("PersonalAccessToken", ["user_id"], {
      name: "PersonalAccessToken_user_id_idx",
    });

    await queryInterface.addIndex("PersonalAccessToken", ["token_hash"], {
      name: "PersonalAccessToken_token_hash_idx",
      unique: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("PersonalAccessToken");
  },
};
```

**Step 2: Commit**

```bash
git add app/migrations/20260202000000-personal-access-tokens.cjs
git commit -m "feat: (CityCatalyst) add PersonalAccessToken migration"
```

---

## Task 2: Create Sequelize Model

**Files:**
- Create: `app/src/models/PersonalAccessToken.ts`

**Step 1: Write the model file**

```typescript
import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { User, UserId } from "./User";

export interface PersonalAccessTokenAttributes {
  id: string;
  userId: string;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  scopes: string[];
  expiresAt?: Date | null;
  lastUsedAt?: Date | null;
  created?: Date;
  lastUpdated?: Date;
}

export type PersonalAccessTokenPk = "id";
export type PersonalAccessTokenId = PersonalAccessToken[PersonalAccessTokenPk];
export type PersonalAccessTokenOptionalAttributes =
  | "id"
  | "expiresAt"
  | "lastUsedAt"
  | "created"
  | "lastUpdated";
export type PersonalAccessTokenCreationAttributes = Optional<
  PersonalAccessTokenAttributes,
  PersonalAccessTokenOptionalAttributes
>;

export class PersonalAccessToken
  extends Model<
    PersonalAccessTokenAttributes,
    PersonalAccessTokenCreationAttributes
  >
  implements PersonalAccessTokenAttributes
{
  declare id: string;
  declare userId: string;
  declare name: string;
  declare tokenHash: string;
  declare tokenPrefix: string;
  declare scopes: string[];
  declare expiresAt?: Date | null;
  declare lastUsedAt?: Date | null;
  declare created?: Date;
  declare lastUpdated?: Date;

  // PersonalAccessToken belongsTo User via userId
  declare user?: User;
  declare getUser: Sequelize.BelongsToGetAssociationMixin<User>;
  declare setUser: Sequelize.BelongsToSetAssociationMixin<User, UserId>;

  static initModel(sequelize: Sequelize.Sequelize): typeof PersonalAccessToken {
    return PersonalAccessToken.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
          field: "id",
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "user_id",
          references: {
            model: "User",
            key: "user_id",
          },
        },
        name: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        tokenHash: {
          type: DataTypes.CHAR(64),
          allowNull: false,
          unique: true,
          field: "token_hash",
        },
        tokenPrefix: {
          type: DataTypes.STRING(16),
          allowNull: false,
          field: "token_prefix",
        },
        scopes: {
          type: DataTypes.ARRAY(DataTypes.STRING),
          allowNull: false,
          defaultValue: ["read"],
        },
        expiresAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "expires_at",
        },
        lastUsedAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "last_used_at",
        },
        created: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        lastUpdated: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          field: "last_updated",
        },
      },
      {
        sequelize,
        tableName: "PersonalAccessToken",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "lastUpdated",
        indexes: [
          {
            name: "PersonalAccessToken_token_hash_idx",
            unique: true,
            fields: [{ name: "token_hash" }],
          },
          {
            name: "PersonalAccessToken_user_id_idx",
            fields: [{ name: "user_id" }],
          },
        ],
      }
    );
  }
}
```

**Step 2: Commit**

```bash
git add app/src/models/PersonalAccessToken.ts
git commit -m "feat: (CityCatalyst) add PersonalAccessToken model"
```

---

## Task 3: Register Model in init-models.ts

**Files:**
- Modify: `app/src/models/init-models.ts`

**Step 1: Add imports at top of file (after other model imports)**

Add after the OAuthClientAuthz imports (~line 238):

```typescript
import {
  PersonalAccessToken as _PersonalAccessToken,
  PersonalAccessTokenAttributes,
  PersonalAccessTokenCreationAttributes,
  PersonalAccessTokenOptionalAttributes,
} from "./PersonalAccessToken";
```

**Step 2: Add to exports (~line 293)**

Add after `_OAuthClientAuthz as OAuthClientAuthz,`:

```typescript
  _PersonalAccessToken as PersonalAccessToken,
```

**Step 3: Add type exports (~line 399)**

Add after `OAuthClientAuthzOptionalAttributes,`:

```typescript
  PersonalAccessTokenAttributes,
  PersonalAccessTokenCreationAttributes,
  PersonalAccessTokenOptionalAttributes,
```

**Step 4: Initialize model in initModels function (~line 460)**

Add after `const OAuthClientAuthz = _OAuthClientAuthz.initModel(sequelize);`:

```typescript
  const PersonalAccessToken = _PersonalAccessToken.initModel(sequelize);
```

**Step 5: Add associations (~line 1097, after OAuthClientAuthz associations)**

```typescript
  // PersonalAccessToken associations
  PersonalAccessToken.belongsTo(User, {
    as: "user",
    foreignKey: "userId",
    targetKey: "userId",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  User.hasMany(PersonalAccessToken, {
    as: "personalAccessTokens",
    foreignKey: "userId",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
```

**Step 6: Add to return object (~line 1192)**

Add after `OAuthClientAuthz: OAuthClientAuthz,`:

```typescript
    PersonalAccessToken: PersonalAccessToken,
```

**Step 7: Commit**

```bash
git add app/src/models/init-models.ts
git commit -m "feat: (CityCatalyst) register PersonalAccessToken model"
```

---

## Task 4: Create PAT Validator Service

**Files:**
- Create: `app/src/lib/auth/pat-validator.ts`

**Step 1: Write the PAT validator**

```typescript
import { createHash } from "crypto";
import { db } from "@/models";
import { AppSession } from "@/lib/auth";
import { Roles } from "@/util/types";
import createHttpError from "http-errors";

const PAT_PREFIX = "cc_pat_";

export function isPATToken(token: string): boolean {
  return token.startsWith(PAT_PREFIX);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface PATValidationResult {
  session: AppSession;
  scopes: string[];
}

export async function validatePAT(
  token: string,
  method: string
): Promise<PATValidationResult> {
  const tokenHash = hashToken(token);

  const pat = await db.models.PersonalAccessToken.findOne({
    where: { tokenHash },
    include: [{ model: db.models.User, as: "user" }],
  });

  if (!pat) {
    throw new createHttpError.Unauthorized("Invalid access token");
  }

  // Check expiration
  if (pat.expiresAt && new Date(pat.expiresAt) < new Date()) {
    throw new createHttpError.Unauthorized("Access token expired");
  }

  // Check scopes
  const scopes = pat.scopes || [];
  const needsRead = ["GET", "HEAD"].includes(method);
  const needsWrite = ["PUT", "PATCH", "POST", "DELETE"].includes(method);

  if (needsRead && !scopes.includes("read")) {
    throw new createHttpError.Forbidden("Token does not have read scope");
  }

  if (needsWrite && !scopes.includes("write")) {
    throw new createHttpError.Forbidden("Token does not have write scope");
  }

  // Update lastUsedAt (fire and forget)
  pat.update({ lastUsedAt: new Date() }).catch(() => {
    // Ignore errors updating lastUsedAt
  });

  const user = pat.user;
  if (!user) {
    throw new createHttpError.Unauthorized("User not found for token");
  }

  const session: AppSession = {
    expires: pat.expiresAt?.toISOString() || "9999-12-31T23:59:59Z",
    user: {
      id: user.userId,
      name: user.name || "",
      email: user.email || "",
      image: user.pictureUrl || null,
      role: (user.role as Roles) || Roles.User,
    },
  };

  return { session, scopes };
}
```

**Step 2: Commit**

```bash
git add app/src/lib/auth/pat-validator.ts
git commit -m "feat: (CityCatalyst) add PAT validator service"
```

---

## Task 5: Integrate PAT Validation into apiHandler

**Files:**
- Modify: `app/src/util/api.ts`

**Step 1: Add import at top of file**

Add after other imports (~line 24):

```typescript
import { isPATToken, validatePAT } from "@/lib/auth/pat-validator";
```

**Step 2: Modify the authorization block in apiHandler**

Replace the authorization handling block (starting at `if (authorization) {` around line 285) with:

```typescript
      if (authorization) {
        const match = authorization.match(/^Bearer\s+(.*)$/);
        if (!match) {
          throw new createHttpError.BadRequest("Malformed Authorization header");
        }
        const bearerToken = match[1];

        // Check if it's a Personal Access Token
        if (isPATToken(bearerToken)) {
          const { session: patSession } = await validatePAT(bearerToken, req.method);
          session = patSession;
        } else {
          // Existing JWT/OAuth validation
          const token = getBearerToken(authorization);
          if (!token) {
            throw new createHttpError.Unauthorized(
              "Invalid or expired access token",
            );
          }

          const origin = process.env.HOST || new URL(req.url).origin;
          if (token.aud !== origin) {
            throw new createHttpError.Unauthorized("Wrong server for token");
          }

          // Check if this is service-to-service authentication
          if (serviceName && serviceKey) {
            // Validate service credentials
            const isValidService = await validateServiceCredentials(
              serviceName,
              serviceKey,
            );
            if (!isValidService) {
              throw new createHttpError.Unauthorized(
                "Invalid service credentials",
              );
            }

            // For service tokens, we only need basic JWT validation (no OAuth checks)
            session = await makeServiceUserSession(token);
            logger.debug(
              {
                user_id: token.sub,
                service_name: serviceName,
                endpoint: new URL(req.url).pathname,
              },
              "Service-to-service token validated",
            );
          } else if (hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
            // OAuth validation path for regular client tokens
            const client = await OAuthClient.findByPk(token.client_id);
            if (!client) {
              throw new createHttpError.Unauthorized("Invalid client");
            }
            const scopes = token.scope.split(" ");
            if (
              ["GET", "HEAD"].includes(req.method) &&
              !scopes.includes("read")
            ) {
              throw new createHttpError.Unauthorized("No read scope available");
            }
            if (
              ["PUT", "PATCH", "POST", "DELETE"].includes(req.method) &&
              !scopes.includes("write")
            ) {
              throw new createHttpError.Unauthorized("No write scope available");
            }
            const authz = await OAuthClientAuthz.findOne({
              where: {
                clientId: token.client_id,
                userId: token.sub,
              },
            });
            if (!authz) {
              throw new createHttpError.Unauthorized("Authorization revoked");
            }
            await authz.update({ lastUsed: new Date() });
            session = await makeOAuthUserSession(token);
          } else {
            throw new createHttpError.Unauthorized(
              "OAuth not enabled and no service credentials provided",
            );
          }
        }
      } else {
        session = await Auth.getServerSession();
      }
```

**Step 3: Commit**

```bash
git add app/src/util/api.ts
git commit -m "feat: (CityCatalyst) integrate PAT validation into apiHandler"
```

---

## Task 6: Create Token Management API - List & Create

**Files:**
- Create: `app/src/app/api/v1/user/tokens/route.ts`

**Step 1: Write the route handler**

```typescript
import { apiHandler } from "@/util/api";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/models";
import { z } from "zod";
import { nanoid } from "nanoid";
import { hashToken } from "@/lib/auth/pat-validator";
import createHttpError from "http-errors";

const PAT_PREFIX = "cc_pat_";

const createTokenSchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.enum(["read", "write"])).min(1),
  expiresAt: z.string().datetime().optional().nullable(),
});

// GET /api/v1/user/tokens - List user's tokens
export const GET = apiHandler(async (req, { session }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Must be logged in");
  }

  const tokens = await db.models.PersonalAccessToken.findAll({
    where: { userId: session.user.id },
    attributes: [
      "id",
      "name",
      "tokenPrefix",
      "scopes",
      "expiresAt",
      "lastUsedAt",
      "created",
    ],
    order: [["created", "DESC"]],
  });

  return NextResponse.json({ tokens });
});

// POST /api/v1/user/tokens - Create new token
export const POST = apiHandler(async (req, { session }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Must be logged in");
  }

  const body = await req.json();
  const parsed = createTokenSchema.parse(body);

  // Generate the token
  const tokenId = nanoid(32);
  const plainToken = `${PAT_PREFIX}${tokenId}`;
  const tokenHash = hashToken(plainToken);
  const tokenPrefix = plainToken.substring(0, 12); // "cc_pat_" + first 5 chars

  const pat = await db.models.PersonalAccessToken.create({
    userId: session.user.id,
    name: parsed.name,
    tokenHash,
    tokenPrefix,
    scopes: parsed.scopes,
    expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
  });

  return NextResponse.json(
    {
      id: pat.id,
      token: plainToken, // Only returned once!
      name: pat.name,
      tokenPrefix: pat.tokenPrefix,
      scopes: pat.scopes,
      expiresAt: pat.expiresAt,
      created: pat.created,
    },
    { status: 201 }
  );
});
```

**Step 2: Commit**

```bash
git add app/src/app/api/v1/user/tokens/route.ts
git commit -m "feat: (CityCatalyst) add token list and create endpoints"
```

---

## Task 7: Create Token Management API - Delete

**Files:**
- Create: `app/src/app/api/v1/user/tokens/[id]/route.ts`

**Step 1: Write the delete route handler**

```typescript
import { apiHandler } from "@/util/api";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/models";
import createHttpError from "http-errors";

// DELETE /api/v1/user/tokens/:id - Revoke/delete a token
export const DELETE = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Must be logged in");
  }

  const { id } = params;

  const pat = await db.models.PersonalAccessToken.findOne({
    where: {
      id,
      userId: session.user.id,
    },
  });

  if (!pat) {
    throw new createHttpError.NotFound("Token not found");
  }

  await pat.destroy();

  return NextResponse.json({ success: true });
});
```

**Step 2: Commit**

```bash
git add app/src/app/api/v1/user/tokens/[id]/route.ts
git commit -m "feat: (CityCatalyst) add token delete endpoint"
```

---

## Task 8: Run Migration and Typecheck

**Step 1: Run the database migration**

```bash
cd app && npm run db:migrate
```

Expected: Migration runs successfully, creates PersonalAccessToken table.

**Step 2: Run typecheck**

```bash
cd app && npm run typecheck
```

Expected: No TypeScript errors.

**Step 3: Commit if any fixes were needed**

---

## Task 9: Manual Testing

**Step 1: Start the dev server**

```bash
cd app && npm run dev
```

**Step 2: Test token creation via curl (must be logged in via browser first)**

Use browser DevTools to get your session cookie, then:

```bash
# Create a token
curl -X POST http://localhost:3000/api/v1/user/tokens \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"name": "Test Token", "scopes": ["read", "write"]}'
```

Expected: Returns JSON with `token` field containing `cc_pat_...`

**Step 3: Test token authentication**

```bash
# Use the token to access MCP endpoint
curl -X POST http://localhost:3000/api/v1/mcp \
  -H "Authorization: Bearer cc_pat_<your-token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```

Expected: Returns MCP tools list (or appropriate response if not initialized)

**Step 4: Test token listing**

```bash
curl http://localhost:3000/api/v1/user/tokens \
  -H "Cookie: <your-session-cookie>"
```

Expected: Returns list of tokens (without the full token, only prefix)

**Step 5: Test token deletion**

```bash
curl -X DELETE http://localhost:3000/api/v1/user/tokens/<token-id> \
  -H "Cookie: <your-session-cookie>"
```

Expected: Returns `{"success": true}`

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Database migration | `migrations/20260202000000-personal-access-tokens.cjs` |
| 2 | Sequelize model | `models/PersonalAccessToken.ts` |
| 3 | Register model | `models/init-models.ts` |
| 4 | PAT validator | `lib/auth/pat-validator.ts` |
| 5 | apiHandler integration | `util/api.ts` |
| 6 | List & Create API | `app/api/v1/user/tokens/route.ts` |
| 7 | Delete API | `app/api/v1/user/tokens/[id]/route.ts` |
| 8 | Migration & typecheck | - |
| 9 | Manual testing | - |

**UI implementation** is deferred - can be added in a follow-up task.
