# QA Feature Flags - LocalStorage Override System

## Overview

The QA Feature Flags system allows Quality Assurance teams to override environment-based feature flags using localStorage. This enables independent testing of features without deployments or affecting other users.

**Key Concept:** QA overrides in localStorage take **precedence** over environment variables.

## How Flag Names Work

### Important: Flag Naming Convention

When working with feature flags, the flag names are **always the same** across all contexts:

```
Environment Variable:  JN_ENABLED
Code Enum:            FeatureFlags.JN_ENABLED
LocalStorage Value:   JN_ENABLED          ← Same name!
```

**NOT** `qa_feature_JN_ENABLED` or `qa_feature_flags_JN_ENABLED` ❌

### Storage Structure

LocalStorage uses a **single key** to store **all** QA overrides:

```javascript
// LocalStorage Key (only one)
localStorage.getItem('qa_feature_flags')

// Value (JSON object with flag names as keys)
{
  "JN_ENABLED": false,
  "CCRA_MODULE": true,
  "ANALYTICS_ENABLED": false
}
```

## Adding a New Feature Flag

### Step 1: Add to Environment Variables

In your `.env` file:

```bash
# Add the flag name to the comma-separated list
NEXT_PUBLIC_FEATURE_FLAGS="JN_ENABLED,ANALYTICS_ENABLED,CCRA_MODULE,MY_NEW_FEATURE"
```

### Step 2: Add to TypeScript Enum

In `/app/src/util/feature-flags.ts`:

```typescript
export enum FeatureFlags {
  // ... existing flags
  MY_NEW_FEATURE = "MY_NEW_FEATURE",
}
```

### Step 3: Use in Code

```typescript
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";

if (hasFeatureFlag(FeatureFlags.MY_NEW_FEATURE)) {
  // Show new feature
}
```

### Step 4: QA Can Override

In browser console:

```javascript
// QA overrides using the SAME flag name
qaFlags.set(qaFlags.FeatureFlags.MY_NEW_FEATURE, true)
location.reload()
```

## Quick Start for QA Engineers

### Browser Console Commands

Open browser console (F12) and use the global `qaFlags` object:

```javascript
// 1. Enable a feature for testing
qaFlags.set(qaFlags.FeatureFlags.CCRA_MODULE, true)

// 2. Disable a feature for testing
qaFlags.set(qaFlags.FeatureFlags.JN_ENABLED, false)

// 3. See all available feature flags
qaFlags.FeatureFlags
// Returns: {
//   ENTERPRISE_MODE: "ENTERPRISE_MODE",
//   JN_ENABLED: "JN_ENABLED",
//   CCRA_MODULE: "CCRA_MODULE",
//   // ... etc
// }

// 4. View your current QA overrides
qaFlags.list()
// Returns: { CCRA_MODULE: true, JN_ENABLED: false }

// 5. See complete status of ALL flags
qaFlags.debug()
// Outputs detailed table showing:
// - Environment flags
// - Your QA overrides
// - Final state (which one wins)

// 6. Remove a specific override (revert to environment default)
qaFlags.clear(qaFlags.FeatureFlags.CCRA_MODULE)

// 7. Remove ALL QA overrides
qaFlags.clearAll()
```

**⚠️ IMPORTANT:** After any change, **reload the page** for it to take effect:

```javascript
qaFlags.set(qaFlags.FeatureFlags.CCRA_MODULE, true)
location.reload()
```

## Admin Feature Flags Page

### Accessing the Page

Admin users can access a visual interface at:

```
/en/admin/feature-flags
```

**Note:** No navigation links exist to this page. Type the URL directly.

### Page Features

1. **Feature Flags Table** - All flags with status (enabled/disabled) and source (environment/QA override)
2. **Active QA Overrides** - Highlights which flags you've overridden
3. **Console Commands** - Copy-paste ready examples
4. **Available Flags Reference** - Complete list of all flags

## Priority System

The system checks flags in this order:

```
┌─────────────────────────────────────┐
│ 1. Check localStorage                │
│    Key: "qa_feature_flags"           │
│    Value: {"JN_ENABLED": false}      │
└─────────────────────────────────────┘
           │
           ├─── Found in localStorage?
           │    └─> Return QA override value ✅
           │
           └─── Not in localStorage?
                     ↓
           ┌─────────────────────────────────────┐
           │ 2. Check Environment Variable        │
           │    NEXT_PUBLIC_FEATURE_FLAGS         │
           │    = "JN_ENABLED,CCRA_MODULE,..."    │
           └─────────────────────────────────────┘
                     ↓
                Return env value (true if in list, false if not)
```

### Example Scenarios

**Scenario A: QA Override Exists**
```javascript
localStorage: { "CCRA_MODULE": true }
Environment:  CCRA_MODULE not in list
Result:       ✅ TRUE (localStorage wins)
```

**Scenario B: No QA Override**
```javascript
localStorage: (not set)
Environment:  JN_ENABLED in list
Result:       ✅ TRUE (env default)
```

**Scenario C: QA Override Disables Feature**
```javascript
localStorage: { "JN_ENABLED": false }
Environment:  JN_ENABLED in list
Result:       ❌ FALSE (localStorage wins)
```

## Available Feature Flags

| Flag | Description | Default (Staging) |
|------|-------------|-------------------|
| `ENTERPRISE_MODE` | Enterprise features and UI | OFF |
| `PROJECT_OVERVIEW_ENABLED` | Project overview dashboard | ON |
| `ACCOUNT_SETTINGS_ENABLED` | User account settings page | ON |
| `UPLOAD_OWN_DATA_ENABLED` | File upload functionality | ON |
| `JN_ENABLED` | Journey Navigation (new UI) | ON |
| `OAUTH_ENABLED` | OAuth authentication | ON |
| `ANALYTICS_ENABLED` | Analytics tracking | ON |
| `CCRA_MODULE` | Climate Change Risk Assessment | OFF |

## Code Implementation Examples

### Basic Usage

```typescript
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";

export function MyComponent() {
  const showNewFeature = hasFeatureFlag(FeatureFlags.CCRA_MODULE);

  return (
    <div>
      {showNewFeature ? <NewFeatureComponent /> : <OldFeatureComponent />}
    </div>
  );
}
```

## E2E Testing with Feature Flags

Set QA overrides in Playwright tests using `context.addInitScript()`:

```typescript
import { FeatureFlags } from "@/util/feature-flags";

test('should show CCRA module when flag is enabled', async ({ page, context }) => {
  // Set QA override BEFORE page loads
  await context.addInitScript(() => {
    // Use the flag name directly (NOT with qa_feature_ prefix)
    const qaFlags = { 
      [FeatureFlags.CCRA_MODULE]: true 
    };
    localStorage.setItem('qa_feature_flags', JSON.stringify(qaFlags));
  });

  await page.goto('/dashboard');
  
  // Assert CCRA module is visible
  await expect(page.getByTestId('ccra-module')).toBeVisible();
});
```

### Testing Multiple Flags

```typescript
test('test with multiple flag overrides', async ({ page, context }) => {
  await context.addInitScript(() => {
    const qaFlags = {
      CCRA_MODULE: true,
      JN_ENABLED: false,
      ANALYTICS_ENABLED: false
    };
    localStorage.setItem('qa_feature_flags', JSON.stringify(qaFlags));
  });

  await page.goto('/');
  // ... your tests
});
```

## Troubleshooting

### Flag not working after setting

**Solution:**
1. Verify flag name is correct (use `qaFlags.FeatureFlags` to see all)
2. **Reload the page** - changes only apply after reload
3. Check with `qaFlags.debug()` to see actual state

```javascript
// Wrong - flag name doesn't exist
qaFlags.set("my_feature", true)  // ❌

// Correct - use the enum
qaFlags.set(qaFlags.FeatureFlags.CCRA_MODULE, true)  // ✅
location.reload()
```

### Can't see my overrides

**Solution:**
```javascript
// Check what's actually stored
qaFlags.list()
// or
localStorage.getItem('qa_feature_flags')
```

### Overrides not persisting

**Causes:**
- Using incognito/private mode (clears on close)
- Browser data was cleared
- Different domain (localhost vs production)

**Solution:**
- Save your config: `JSON.stringify(qaFlags.list())`
- Restore when needed

### Feature still shows old behavior

**Solution:**
1. Hard reload: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. Clear browser cache
3. Verify override is set: `qaFlags.debug()`

## LocalStorage Details

### Storage Key and Structure

```javascript
// Single storage key for ALL QA overrides
localStorage.getItem('qa_feature_flags')

// Returns JSON string:
'{"CCRA_MODULE":true,"JN_ENABLED":false}'

// Parsed:
{
  "CCRA_MODULE": true,      // Flag name (same as enum)
  "JN_ENABLED": false        // Flag name (same as enum)
}
```

## Security & Best Practices

### Security Notes

- ✅ **Client-side only** - No security risk, only affects UI
- ✅ **Safe for feature testing** - Perfect for QA workflows
- ❌ **NOT for authorization** - Never use for permissions/security
- ⚠️ **Can be manipulated** - Anyone can set localStorage flags

### Best Practices

**For QA Engineers:**
- ✅ Always reload after setting flags
- ✅ Use `qaFlags.debug()` to verify state
- ✅ Clear overrides when done testing
- ✅ Document your test scenarios with flag configs

**For Developers:**
- ✅ Always use `hasFeatureFlag()` function
- ✅ Add new flags to the enum
- ✅ Document what each flag does
- ✅ Test both enabled and disabled states
- ❌ Never use feature flags for security/permissions

## API Reference

### Global `qaFlags` Object

Available in browser console (client-side only):

```javascript
qaFlags.set(flag, enabled)     // Set QA override
qaFlags.clear(flag)            // Remove specific override
qaFlags.clearAll()             // Remove all overrides
qaFlags.list()                 // Get all QA overrides
qaFlags.debug()                // Print detailed status
qaFlags.FeatureFlags           // Enum of all available flags
```

### Functions (for code use)

```typescript
import {
  hasFeatureFlag,
  setQAFeatureFlag,
  clearQAFeatureFlag,
  clearAllQAFeatureFlags,
  listQAFeatureFlags,
  debugFeatureFlags,
  FeatureFlags
} from "@/util/feature-flags";

hasFeatureFlag(flag: FeatureFlags): boolean
setQAFeatureFlag(flag: FeatureFlags, enabled: boolean): void
clearQAFeatureFlag(flag: FeatureFlags): void
clearAllQAFeatureFlags(): void
listQAFeatureFlags(): Record<string, boolean>
debugFeatureFlags(): void
```

## Support

**Admin UI:** `/en/admin/feature-flags`  
**Implementation:** `/app/src/util/feature-flags.ts`  
**Console:** `qaFlags.debug()` for current state

For issues, check the console with `qaFlags.debug()` and verify localStorage with `localStorage.getItem('qa_feature_flags')`.
