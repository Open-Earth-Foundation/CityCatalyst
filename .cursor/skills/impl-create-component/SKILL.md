---
name: impl-create-component
description: Create a new React component in CityCatalyst using Chakra UI v3, i18n, and project conventions. Use when the user asks to create, add, or build a new UI component, page section, or widget.
---

# Create Component

## Workflow

### Step 1: Determine Location

| Type | Path |
|------|------|
| Design primitive | `app/src/components/ui/` |
| Feature component | `app/src/components/<FeatureName>/` |
| Page section | `app/src/components/Sections/` |
| Modal/Dialog | `app/src/components/Modals/` |
| Shared/reusable | `app/src/components/shared/` |
| Page component | `app/src/app/[lng]/<route>/page.tsx` |

### Step 2: Create Component File

```tsx
"use client"; // Only if using hooks, event handlers, or browser APIs

import { Box, Text, Heading, Flex } from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";

interface MyComponentProps {
  lng: string;
  inventoryId: string;
}

export function MyComponent({ lng, inventoryId }: MyComponentProps) {
  const { t } = useTranslation(lng, "namespace");

  return (
    <Box p={6} borderRadius="lg" bg="background.overlay">
      <Heading size="lg">{t("title")}</Heading>
    </Box>
  );
}
```

### Step 3: Add Data Fetching (if needed)

```tsx
import { api } from "@/services/api";

export function MyComponent({ inventoryId }: Props) {
  const { data, isLoading, error } = api.useGetInventoryQuery(inventoryId);

  if (isLoading) return <Skeleton height="200px" />;
  if (error) return <Text color="sentiment.negativeDefault">{t("error")}</Text>;

  return <Box>{data?.inventoryName}</Box>;
}
```

### Step 4: Add i18n Keys

Add to `app/src/i18n/locales/en/<namespace>.json`:

```json
{
  "title": "My Component Title",
  "description": "Component description"
}
```

### Step 5: Add Form (if needed)

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import FormInput from "@/components/form-input";
```

## Conventions

- Use **semantic tokens** for colors (`background.overlay`, `content.primary`), never raw colors
- Use **named exports** (not default)
- Props interface defined above the component
- Pass `lng` down for i18n — it comes from `[lng]` route param
- Use project UI wrappers from `@/components/ui/` (button, dialog, field, etc.)
- Loading states: use `Skeleton` from Chakra
- Error states: show user-friendly translated messages
- All user-facing text must use `t()` from i18next
