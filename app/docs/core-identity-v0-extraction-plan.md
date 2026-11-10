# core-identity v0 — OAuth AS gap list and isolation plan

Spike: [CC-1178](https://linear.app/openearth/issue/CC-1178/extraction-spike-on-our-oauth-as-gap-list-isolation-plan).
Implementation: [CC-1185](https://linear.app/openearth/issue/CC-1185/core-identity-v0-extract-our-as-as-a-service).

Decision already made: extend CityCatalyst’s own authorization server. Do not adopt a third-party IdP. This document is the plan CC-1185 implements.

[CC-670](https://linear.app/openearth/issue/CC-670/rfc-7591-self-service-client-registration-oauth-server-hardening) (RFC 7591 + hardening) and [CC-671](https://linear.app/openearth/issue/CC-671/login-with-citycatalyst-oidc-provider-completion-cc-as-ecosystem-idp) (OIDC provider completion) are absorbed here. Their scope is not re-ticketed. [CC-678](https://linear.app/openearth/issue/CC-678/sso-consumer-social-enterprise-logins-google-microsoft-okta-if) (Okta / Google / Microsoft as upstream IdPs) stays a separate ticket and is not part of v0.

## What exists today

OAuth is an in-process slice of the Next.js app, gated by `OAUTH_ENABLED` (off in production). CityCatalyst itself does not log in through it. Browser login is a NextAuth credentials JWT (`src/lib/auth.ts`). The authorization server is only for other apps, and nothing in production uses it yet.

| Surface | Behavior | Where |
| --- | --- | --- |
| Discovery | RFC 8414-shaped JSON at `/api/v1/oauth/metadata`. Not at `/.well-known/openid-configuration` or `/.well-known/oauth-authorization-server`. Returns 500 when the flag is off. | `src/app/api/v1/oauth/metadata/route.ts` |
| Authorize | Consent page at `/{lng}/authorize`. Requires a CityCatalyst NextAuth session. PKCE S256 required. Scopes limited to `read` and `write`. No `prompt`, no `nonce`, no OIDC. | `src/app/[lng]/authorize/page.tsx`, `AuthorizeForm.tsx` |
| Code issue | `POST /api/v1/auth/code`. Signed JWT, 5 minutes, subject = `session.user.id`. Single-use tracked in a process-local `TTLCache` (10 minutes, max 10k). | `src/app/api/v1/auth/code/route.ts`, `src/app/api/v1/token/route.ts` |
| Token | `POST /api/v1/token`. `authorization_code` and `refresh_token`. HS256 with `VERIFICATION_TOKEN_SECRET`. Access token 7 days, refresh token 30 days. Refresh does not rotate and does not return a new refresh token. | `src/app/api/v1/token/route.ts` |
| Resource-server check | Bearer JWT verified with the same shared secret. `client_id` must exist. `read`/`write` gates the HTTP method. `OAuthClientAuthz` row must still exist. Then the token is turned into a full `AppSession` by loading `User`. | `src/util/api.ts` (`getBearerToken`, `makeOAuthUserSession`) |
| Clients | Admin-only `POST /api/v1/client`. One redirect URI. No `client_secret`, no grant list, no multiple redirects. | `src/app/api/v1/client/route.ts`, `src/models/OAuthClient.ts` |
| Consent revoke | User can delete the `OAuthClientAuthz` row. Outstanding access JWTs stay valid until they expire (up to 7 days) for any resource server that does not share this table. | `src/app/api/v1/user/clients/[client]/route.ts` |
| Login MFA | TOTP (authenticator app) plus one-time recovery codes, checked only inside the credentials `authorize()` callback. No SMS, no email OTP, no `amr`/`acr`. Consent does not step up. | `src/lib/auth.ts`, `src/lib/2fa.ts` |
| Other bearer paths | Personal access tokens (`cc_pat_…`) and Climate Advisor service tokens. Both are separate from the AS and must stay that way. | `src/lib/auth/access-token-validator.ts`, `src/util/api.ts` |

The metadata TypeScript interface already has `jwks_uri`, `registration_endpoint`, `revocation_endpoint`, and `introspection_endpoint`. None of them are returned. There is no `id_token`, no `userinfo`, no `prompt=none`.

### Shared-secret coupling (extraction blocker)

`VERIFICATION_TOKEN_SECRET` signs all of the following:

- OAuth authorization codes, access tokens, and refresh tokens
- email verification and password reset (`src/backend/EmailService.ts`, `src/app/api/v1/auth/verify/route.ts`)
- city, organization, and user invite tokens
- Climate Advisor service tokens (`src/backend/climate-advisor-token.ts`)

A password-reset token and an access token are the same credential format today. JWKS cannot be published, and the AS cannot move to another process, until OAuth signing uses its own key.

Authorization codes live in memory. A second replica, or a separate service, will accept a replayed code. That has to become a database row before the process split.

## Gap list

Priority is what unblocks “CC logs in through core-identity” and the app SDK ([CC-1186](https://linear.app/openearth/issue/CC-1186/app-sdk-sign-in-with-ds-login-silent-sso-roles)). Later items stay on the core-identity roadmap but are not v0 scope.

| # | Gap | Today | v0? | Why this priority |
| --- | --- | --- | --- | --- |
| 1 | Dedicated signing key, RS256, JWKS | HS256, shared secret, no `jwks_uri` | Yes | Every other app has to verify tokens without holding CC’s secret. Also the precondition for splitting the process. |
| 2 | OIDC discovery + `id_token` + `userinfo` | OAuth metadata only, custom path, no identity token | Yes | CC itself must be a stock OIDC relying party (NextAuth generic provider). This is the whole of CC-671. |
| 3 | Durable auth codes | Process-local TTL cache | Yes | Required before more than one instance. |
| 4 | Short-lived access tokens + refresh rotation | 7-day access, refresh reused until day 30, no reuse detection | Yes | Cross-app logout and revoke are meaningless with a 7-day self-contained JWT. |
| 5 | Revocation (RFC 7009) | Deleting `OAuthClientAuthz` only affects resource servers that share the CC database | Yes | First-party apps will not share the CC database. |
| 6 | Introspection (RFC 7662) | Absent. Interface field only. | Yes | Resource servers that need immediate revoke, and any opaque handle, call this. JWT access tokens are still verified locally via JWKS; introspection is not on the hot path. |
| 7 | OP browser session + `prompt=none` | The only browser session is CC’s NextAuth cookie. Authorize always shows consent. `prompt` is ignored. | Yes | Silent SSO across apps is a session on the identity host, not a cookie inside CC. The SDK (CC-1186) only calls it. |
| 8 | Move TOTP with the credential check; emit `amr` | TOTP works, but only inside CC’s credentials provider | Yes | Login moves. The factor has to move with it. No new factor types. |
| 9 | Minimal tenancy claims | Token has `sub`, `client_id`, `scope`. Role is reloaded from `User.role` (`user` \| `admin`) at request time. | Yes, narrow | See claims below. Full roles schema is not a v0 blocker. |
| 10 | CC as relying party, behind a flag | CC never uses its own AS | Yes | CC-1185 acceptance criterion. |
| 11 | RFC 7591 dynamic client registration | Admin-only `POST /api/v1/client`. `registration_endpoint` is never advertised. | No | First-party apps are registered by us. Open self-service is the ecosystem follow-up, same service, no second extraction. Absorbs the rest of CC-670. |
| 12 | Email OTP factor | Absent | No | TOTP already covers v0 login. Email OTP is the next factor, still inside core-identity. |
| 13 | SMS OTP factor | Absent | No | Needs a provider, delivery cost, and a GDPR decision. Not required for CC login or silent SSO. |
| 14 | Okta (and Google / Microsoft) as upstream IdPs | Credentials provider only | No | Stays [CC-678](https://linear.app/openearth/issue/CC-678/sso-consumer-social-enterprise-logins-google-microsoft-okta-if). Federation plugs into the user store after v0; it does not gate the extraction. |

Client-record gaps that ride along with item 10, because the moved service should not preserve them: a single redirect URI, no confidential-client secret, refresh grant that does not authenticate the client. v0 clients are either public (PKCE) or confidential (`client_secret_basic`). Multiple redirect URIs. Still admin-registered.

## Isolation boundary

core-identity is the OpenID provider and the credential store. CityCatalyst becomes a relying party and a resource server. Domain authorization stays in CityCatalyst.

```mermaid
flowchart LR
  subgraph clients [Clients]
    Browser[Browser]
    CCUI[CityCatalyst UI]
    Apps[Other DS apps]
  end

  subgraph id [core-identity v0]
    OP[Login, consent, OP session]
    AS[Authorization server]
    Store[Users, clients, refresh tokens, RS256 key]
  end

  subgraph cc [CityCatalyst monolith]
    RS[API resource server]
    Authz[PermissionService]
    Tenancy[Org, project, city membership]
    Local[PATs and service tokens]
  end

  Browser --> CCUI
  Browser --> Apps
  CCUI -->|OIDC code plus PKCE| AS
  Apps -->|prompt=none| AS
  AS --> OP
  AS --> Store
  AS -->|read-only org_ids| Tenancy
  CCUI -->|access token| RS
  Apps -->|access token| RS
  RS -->|verify via JWKS| AS
  RS --> Authz
  Authz --> Tenancy
  Local --> RS
```

CityCatalyst is the only relying party wired in v0. Other DS apps are the same seam, consumed later by the app SDK (CC-1186). Okta, SMS, email OTP, and RFC 7591 registration are not in this picture. PATs and Climate Advisor service tokens never go through core-identity.

### Moves into core-identity

- Credential login: email, `passwordHash`, TOTP secret, recovery-code hashes. Same user UUID as today (`User.userId` becomes `sub`), so CC needs no mapping table.
- OP session cookie. This is new. It is not the NextAuth cookie.
- Protocol: authorize, token, revoke, introspect, userinfo, JWKS, `/.well-known/openid-configuration`.
- Signing keys (private key never leaves the service).
- `OAuthClient`, `OAuthClientI18N`, `OAuthClientAuthz`, authorization codes, refresh-token families.
- Consent UI (the current `/{lng}/authorize` page, moved or rehosted). Login UI for the hosted flow.

### Stays in the monolith

- Product data: `Organization`, `Project`, `City`, inventories, modules.
- Membership writes: `OrganizationAdmin`, `ProjectAdmin`, `CityUser`. These remain CC-owned until the hierarchy schema ([CC-1063](https://linear.app/openearth/issue/CC-1063/define-gcom-ds-project-hierarchy-schema-v0)) is frozen and a later ticket moves membership.
- `PermissionService` and every city/inventory/project check. Tokens do not become an authorization engine.
- Personal access tokens (`cc_pat_…`) and the Climate Advisor service-key path. They are CC API credentials, not AS tokens.
- Invites, password-reset *email delivery*, org-frozen checks, admin chrome. Password *verification* moves; the email template can keep being sent by CC in v0 if core-identity calls a single CC mail endpoint, or move with the service if that is less work. Do not block the extraction on the mailer.
- The Chakra admin client list. It becomes a client of the core-identity admin API. Do not rebuild product UI inside the identity service.

### The seam

1. Browser hits CC. CC has no session. CC redirects to core-identity (`/authorize`, PKCE, CC’s client id).
2. core-identity authenticates (password + TOTP if enrolled) and sets its own session cookie.
3. core-identity redirects back with a code. CC’s token handler exchanges it and stores an RP session.
4. CC API calls from other apps send the access token. CC verifies the JWT signature against JWKS, checks `iss`/`aud`/`exp`, and authorizes with `PermissionService` using `sub`. CC stops calling `jwt.verify` with `VERIFICATION_TOKEN_SECRET` for access tokens.
5. A second app uses `prompt=none`. If the OP cookie is present, core-identity returns a code with no UI.

`apiHandler` must not load a CC `User` row and synthesize an `AppSession` as the way it “validates OAuth”. That coupling is what makes the AS inseparable from the monolith today (`makeOAuthUserSession` in `src/util/api.ts`). After the cut, validation is cryptographic. The user row is only needed when a handler needs profile fields.

### Tenancy claims (v0, deliberately small)

[CC-1063](https://linear.app/openearth/issue/CC-1063/define-gcom-ds-project-hierarchy-schema-v0) is still open and [CC-1065](https://linear.app/openearth/issue/CC-1065/define-gcom-ds-user-roles-schema-v0-roles-permission-groups-scope) is a roles schema, not an enforcement engine. v0 must not invent the DS role catalogue inside the token.

Access token and `id_token` claims in v0:

| Claim | Source in v0 | Notes |
| --- | --- | --- |
| `sub` | `User.userId` | Stable UUID. |
| `email`, `email_verified`, `name` | User row | `email_verified` matches the existing verification flag. |
| `amr` | `["pwd"]` or `["pwd","otp"]` | Records how this login happened. |
| `org_ids` | Read-only snapshot of org membership at token issue | Best-effort from `OrganizationAdmin` plus orgs reached through `ProjectAdmin` / `CityUser`. Empty array is valid. |
| `active_org_id` | Omitted when CC has no single active org | Do not guess. Apps that need a selected org ask the user. |

`scope` stays `openid` plus the existing `read` / `write` for the CC API. DS roles and permission groups are evaluated by each app (and later by an authz service) from `sub` and `org_ids`. They are not scopes and they are not copied into the token in v0.

How `org_ids` is read without moving membership: a read-only view (or a single internal query) that core-identity uses at token issuance. CC keeps the write path. When CC-1063 lands, the view is replaced. Tokens minted before a membership change stay wrong until refresh; that is acceptable because access tokens are short-lived (below).

### Token shape for v0

- Access token: JWT, RS256, 15 minutes, `aud` = the platform resource indicator (one audience for v0, not “whatever origin served the request”).
- Refresh token: opaque, stored hashed, 30 days, rotated on every use, reuse revokes the family.
- `id_token`: RS256, `nonce` echoed, 15 minutes.
- Authorization code: opaque row, 60 seconds, single use, bound to client, redirect, PKCE challenge, and user.

## Extraction order

Do the protocol fix inside the monolith first, then move the process. The flag stays off in production until CC login through the new service is proven in dev.

1. **Split the signing key.** New `OAUTH_SIGNING_KEY` (RS256). Leave `VERIFICATION_TOKEN_SECRET` on invites, email verification, password reset, and Climate Advisor service tokens. No external verifier is published before this split.
2. **Make the protocol real, still in-process, still behind `OAUTH_ENABLED`.** Durable codes, JWKS, `/.well-known/openid-configuration`, `id_token`, `userinfo`, refresh rotation, revocation, introspection, `prompt=none`. Contract tests from [CC-1176](https://linear.app/openearth/issue/CC-1176/freeze-platform-contracts-v1-openapi-auth-contract-event-schemas) go green against this monolith.
3. **Cut CC’s resource-server check over to JWKS.** `getBearerToken` no longer uses the shared secret for access tokens. PAT and service tokens unchanged.
4. **Extract the process.** New `core-identity` service owns the tables and routes from the “Moves” list. Same user UUIDs. CC admin UI and consent page call it. Deploy in dev only.
5. **CC logs in as a relying party, behind a flag.** NextAuth OIDC provider pointed at core-identity. Credentials provider remains the fallback until the flag is the dev default. This is the CC-1185 acceptance check.
6. **Delete the in-process AS routes** once dev uses the service. Do not keep two token endpoints.
7. **Fast-follow, same service:** RFC 7591 and a developer registration page (rest of CC-670), then email OTP. SMS and Okta stay outside this sequence (CC-678 for Okta).

[CC-1184](https://linear.app/openearth/issue/CC-1184/split-inside-execution-wave-1-packages-lint-boundaries-owned-db) (owned Postgres schemas) can run in parallel. The first owned schema for this work is the identity schema (`User` credential columns, OAuth tables, codes, refresh tokens, signing keys). Cross-schema foreign keys from those tables to `Organization` / `Project` are dropped; `org_ids` is a snapshot, not an FK.

## What v0 does not do

- Replace `PermissionService` or encode the CC-1065 role catalogue in tokens.
- Move `Organization` / `Project` / `City` or their membership writes.
- Issue or validate personal access tokens.
- Register arbitrary third-party clients (RFC 7591).
- Send SMS, or accept Okta / Google / Microsoft logins.
- Build the app SDK. That is CC-1186, which consumes `prompt=none` and the claims above.
- Turn the flag on in production. Dev deployment plus CC login behind a flag is the v0 bar. Production enablement is a later change once the security review from CC-670 has a real service to review.

## CC-670 and CC-671

Confirmed: both are duplicates of CC-1185, not parallel work.

- CC-671 is entirely inside steps 2 and 5 (OIDC discovery, `id_token`, `userinfo`, `jwks_uri`, CC as the first real client). The “pilot external app” acceptance criterion is satisfied by CC logging in through the service, plus the platform-contracts auth tests. `api-demo/` can be a second client after that; it is not a separate project.
- CC-670 splits. RS256, JWKS, revocation, introspection, and refresh rotation are v0 (steps 1–2). RFC 7591, the developer registration page, and production enablement are the fast-follow. They still belong to core-identity, not a revived CC-670.

CC-678 is not absorbed.
