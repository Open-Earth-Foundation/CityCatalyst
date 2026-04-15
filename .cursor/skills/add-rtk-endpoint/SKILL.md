---
name: add-rtk-endpoint
description: Add a new RTK Query endpoint to CityCatalyst's API service. Use when the user asks to add data fetching, create a query hook, add a mutation, or connect frontend to a new API endpoint.
---

# Add RTK Query Endpoint

## Workflow

### Step 1: Define Types

Add response/request types to `app/src/util/types.ts` (or import from models):

```typescript
export interface WidgetResponse {
  widgetId: string;
  name: string;
  inventoryId: string;
}
```

### Step 2: Add Endpoint

In `app/src/services/api.ts`, inside `endpoints: (builder) => ({...})`:

**Query (GET):**
```typescript
getWidget: builder.query<WidgetResponse, string>({
  query: (widgetId) => `widget/${widgetId}`,
  providesTags: (_result, _err, id) => [{ type: "Widget", id }],
}),

getWidgets: builder.query<WidgetResponse[], string>({
  query: (inventoryId) => `inventory/${inventoryId}/widgets`,
  providesTags: (result) =>
    result
      ? [...result.map(({ widgetId }) => ({ type: "Widget" as const, id: widgetId })), "Widget"]
      : ["Widget"],
}),
```

**Mutation (POST/PATCH/DELETE):**
```typescript
createWidget: builder.mutation<WidgetResponse, { inventoryId: string; body: CreateWidgetRequest }>({
  query: ({ inventoryId, body }) => ({
    url: `inventory/${inventoryId}/widgets`,
    method: "POST",
    body,
  }),
  invalidatesTags: ["Widget"],
}),

deleteWidget: builder.mutation<void, string>({
  query: (widgetId) => ({
    url: `widget/${widgetId}`,
    method: "DELETE",
  }),
  invalidatesTags: (_result, _err, id) => [{ type: "Widget", id }],
}),
```

### Step 3: Add Tag Type (if new)

Add to the `tagTypes` array at the top of `createApi`:

```typescript
tagTypes: [
  // ... existing tags
  "Widget",
],
```

### Step 4: Use in Component

```tsx
import { api } from "@/services/api";

function WidgetList({ inventoryId }: { inventoryId: string }) {
  const { data, isLoading } = api.useGetWidgetsQuery(inventoryId);
  const [createWidget, { isLoading: isCreating }] = api.useCreateWidgetMutation();

  const handleCreate = async () => {
    await createWidget({ inventoryId, body: { name: "New Widget" } });
    // Cache auto-invalidates via tags — no manual refetch needed
  };

  if (isLoading) return <Skeleton />;
  return (
    <>
      {data?.map((w) => <WidgetCard key={w.widgetId} widget={w} />)}
      <Button onClick={handleCreate} loading={isCreating}>Add</Button>
    </>
  );
}
```

## Tag Strategy

- **`providesTags`** on queries: declare what cache entries this query provides
- **`invalidatesTags`** on mutations: declare which cache entries to invalidate after mutation
- Use `{ type: "Tag", id: specificId }` for granular invalidation
- Use `"Tag"` (string only) to invalidate ALL entries of that type

## Existing Tag Types

`UserInfo`, `UserPermissions`, `InventoryProgress`, `UserInventories`, `SubSectorValue`, `InventoryValue`, `ActivityValue`, `UserData`, `FileData`, `CityData`, `ReportResults`, `EmissionsFactor`, `Organization`, `Project`, `Theme`, `DataSource`, `VersionHistory`, `HIAP`, `Module`, `PersonalAccessToken`, `OAuthClient`
