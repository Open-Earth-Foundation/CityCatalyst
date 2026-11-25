---
name: add-i18n-strings
description: Add user-facing strings using i18next. Use when the user adds UI copy, sees a hardcoded English string in a component, or asks to translate / internationalise a piece of UI.
---

# add-i18n-strings

CityCatalyst supports `en` (fallback), `de`, `es`, `fr`, `pt`. ESLint (`eslint-plugin-i18next`) blocks raw strings in TSX.

## Workflow

### Step 1 — Pick a namespace

Namespace = filename of the JSON in `app/src/i18n/locales/en/`. Reuse before creating new ones:

- `auth.json`, `dashboard.json`, `inventory.json`, `data.json`, `common.json`, `emails.json`, `hiap.json`, `onboarding.json`, …

If none fits, create a new namespace (file in **all** locales).

### Step 2 — Add the keys to **English first**

```json
// app/src/i18n/locales/en/widget.json
{
  "page-title": "Widgets",
  "save-button": "Save",
  "deleted-toast": "Widget {{name}} deleted",
  "errors": {
    "not-found": "Widget not found",
    "save-failed": "Failed to save widget"
  }
}
```

Conventions:
- Keys: kebab-case at leaves; nested objects only when grouping clearly.
- Interpolation: `{{var}}`. Pass values as `t("deleted-toast", { name: widget.name })`.
- No HTML in values; use `<Trans>` from `react-i18next` for rich content.

### Step 3 — Use `t()` in the component

```tsx
import { useTranslation } from "@/i18n/client";

export function WidgetPage({ lng }: { lng: string }) {
  const { t } = useTranslation(lng, "widget");
  return <Heading>{t("page-title")}</Heading>;
}
```

For server components / route handlers, use the server-side `useTranslation` from `@/i18n/server`.

### Step 4 — Other locales

- Other locales auto-translate via the `web-translate.yml` GitHub Action when `app/src/i18n/locales/en/**` changes on `develop`.
- For new namespaces or large additions, run `npm run i18n:update` locally to seed the other locale files; the auto-translate workflow then refines them.

### Step 5 — Verify

```bash
cd app
npm run lint                 # eslint-plugin-i18next will catch hardcoded strings
```

## Anti-patterns

- `<Heading>Widgets</Heading>` — banned. ESLint will catch it. Wrap with `t()`.
- `<Heading>{t("page-title") || "Widgets"}</Heading>` — defeats the purpose. Either the key exists or fix the translation.
- `aria-label="close"` — also user-facing. Wrap in `t()`.
- Building user copy by string concat — use interpolation.
- Adding keys only to `en/*.json` and merging without running the auto-translate flow → other locales lag.
