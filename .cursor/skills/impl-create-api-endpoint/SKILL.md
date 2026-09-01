---
name: impl-create-api-endpoint
description: Create a new REST API endpoint in CityCatalyst. Use when the user asks to create, add, or implement a new API route, endpoint, or backend handler.
---

# Create API Endpoint

## Workflow

### Step 1: Create Route Handler

Create the route file at `app/src/app/api/v1/<resource>/route.ts` (or nested path).

```typescript
/**
 * @swagger
 * /api/v1/<resource>:
 *   get:
 *     operationId: get<Resource>
 *     summary: <Description>
 *     tags:
 *       - <resource>
 *     responses:
 *       200:
 *         description: Success
 */
import { NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";

export const GET = apiHandler(async (req, { session, params, searchParams }) => {
  if (!session) throw new createHttpError.Unauthorized("Unauthorized");
  // Business logic here — delegate to src/backend/ services
  return NextResponse.json({ data: result });
});
```

### Step 2: Add Validation Schema (if POST/PATCH)

Add Zod schema to `app/src/util/validation.ts`:

```typescript
export const create<Resource>Request = z.object({
  name: z.string().min(1),
  // ... fields
});
export type Create<Resource>Request = z.infer<typeof create<Resource>Request>;
```

### Step 3: Add Service Logic (if complex)

Create or extend a service in `app/src/backend/`:

```typescript
// app/src/backend/<Resource>Service.ts
import { db } from "@/models";

export class <Resource>Service {
  static async getById(id: string) {
    return db.models.<Resource>.findByPk(id);
  }
}
```

### Step 4: Add RTK Query Endpoint

In `app/src/services/api.ts`, add inside `endpoints`:

```typescript
get<Resource>: builder.query<ResponseType, string>({
  query: (id) => `<resource>/${id}`,
  providesTags: (_r, _e, id) => [{ type: "<Resource>", id }],
}),
```

Add tag type to `tagTypes` array if new.

### Step 5: Add i18n Keys

Add user-facing strings to `app/src/i18n/locales/en/<namespace>.json`.

### Step 6: Write Tests

Create `app/tests/api/<resource>.jest.ts`:

```typescript
import { setupTests, teardownTests, mockRequest, expectStatusCode } from "../helpers";
import { db } from "@/models";
import { GET } from "@/app/api/v1/<resource>/route";

describe("<Resource> API", () => {
  beforeAll(async () => {
    setupTests();
    await db.initialize();
  });
  afterAll(() => teardownTests());

  it("GET returns data", async () => {
    const req = mockRequest();
    const res = await GET(req, { params: Promise.resolve({}) });
    expectStatusCode(res, 200);
  });
});
```

## Checklist

- [ ] Route handler uses `apiHandler` wrapper
- [ ] Swagger JSDoc added above imports
- [ ] Auth check (`if (!session)`) for protected routes
- [ ] Validation with Zod for request bodies
- [ ] Business logic delegated to service layer
- [ ] Error handling uses `http-errors` (not raw try/catch)
- [ ] RTK Query endpoint added with proper tags
- [ ] i18n keys for user-facing messages
- [ ] Jest test created with `*.jest.ts` naming
