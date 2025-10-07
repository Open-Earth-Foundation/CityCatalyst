# QA Feature Flags System

## Overview

The QA Feature Flags system allows QA engineers to independently enable or disable features for testing purposes, without requiring deployments or affecting other users. This is particularly useful for:

- Testing features that are disabled in production
- Verifying feature toggle behavior
- Testing feature interactions
- Individual QA engineer testing workflows

## How It Works

The system uses a **two-tier priority system** - QA overrides take precedence over environment variables:

```
When checking hasFeatureFlag(FeatureFlags.CCRA_MODULE):

┌──────────────────────────────────────────────┐
│ 1. Check localStorage (QA Override)          │
│    Key: "qa_feature_flags"                   │
│    Value: { "CCRA_MODULE": true }            │
└──────────────────────────────────────────────┘
         │
         ├─── Found in localStorage? ──> Return QA value (true/false)
         │
         └─── Not in localStorage?
                    ↓
         ┌──────────────────────────────────────┐
         │ 2. Check Environment Variable        │
         │    NEXT_PUBLIC_FEATURE_FLAGS         │
         │    Value: "JN_ENABLED,ANALYTICS..."  │
         └──────────────────────────────────────┘
                    ↓
              Return env value (true if in list, false if not)


Example Scenarios:

Scenario A: QA Override Exists
  localStorage: { "CCRA_MODULE": true }
  Environment:  CCRA_MODULE not in list
  Result:       ✅ TRUE (localStorage wins)

Scenario B: No QA Override
  localStorage: (not set)
  Environment:  JN_ENABLED in list
  Result:       ✅ TRUE (env default)

Scenario C: QA Override Disables Feature
  localStorage: { "JN_ENABLED": false }
  Environment:  JN_ENABLED in list
  Result:       ❌ FALSE (localStorage wins)
```

## QA Engineer Usage

### Quick Start (Browser Console)

Open the browser console (F12) and use the global `qaFlags` object:

```javascript
// Enable a feature for testing
qaFlags.set(qaFlags.FeatureFlags.CCRA_MODULE, true)

// Disable a feature for testing
qaFlags.set(qaFlags.FeatureFlags.JN_ENABLED, false)

// See all available feature flags
qaFlags.FeatureFlags
// Returns: {
//   ENTERPRISE_MODE: "ENTERPRISE_MODE",
//   PROJECT_OVERVIEW_ENABLED: "PROJECT_OVERVIEW_ENABLED",
//   ACCOUNT_SETTINGS_ENABLED: "ACCOUNT_SETTINGS_ENABLED",
//   UPLOAD_OWN_DATA_ENABLED: "UPLOAD_OWN_DATA_ENABLED",
//   JN_ENABLED: "JN_ENABLED",
//   OAUTH_ENABLED: "OAUTH_ENABLED",
//   ANALYTICS_ENABLED: "ANALYTICS_ENABLED",
//   CCRA_MODULE: "CCRA_MODULE"
// }

// View current QA overrides
qaFlags.list()
// Returns: { CCRA_MODULE: true, JN_ENABLED: false }

// See complete status of all flags
qaFlags.debug()
// Outputs detailed table showing env flags, QA overrides, and final state

// Remove a specific override (revert to env default)
qaFlags.clear(qaFlags.FeatureFlags.CCRA_MODULE)

// Remove all QA overrides
qaFlags.clearAll()
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
| `CCRA_MODULE` | Climate Change Risk Assessment module | OFF |

## Technical Implementation

### Storage Format

QA flags are stored in localStorage as JSON:

```json
{
  "CCRA_MODULE": true,
  "JN_ENABLED": false
}
```

**Storage Key:** `qa_feature_flags`

### API

#### `setQAFeatureFlag(flag: FeatureFlags, enabled: boolean): void`
Set or update a QA feature flag override.

#### `clearQAFeatureFlag(flag: FeatureFlags): void`
Remove a specific QA override, falling back to environment variable.

#### `clearAllQAFeatureFlags(): void`
Remove all QA overrides.

#### `listQAFeatureFlags(): Record<string, boolean>`
Get all current QA overrides as an object.

#### `debugFeatureFlags(): void`
Print detailed status of all feature flags to console.

## Important Notes

### Scope and Limitations

- ✅ **Client-side only**: QA flags only work in the browser (not in API routes or SSR)
- ✅ **Per-browser**: Each browser/profile has independent settings
- ✅ **Persistent**: Survives page refreshes and browser restarts
- ⚠️ **Not synced**: Doesn't sync across devices or browsers
- ⚠️ **Incognito mode**: Cleared when incognito session ends

### When Flags Take Effect

- **Immediate**: Most UI toggles (navigation, cards, buttons)
- **On Next Render**: Component-level feature checks
- **Requires Refresh**: Route-based features, layouts
- **Requires Re-login**: Authentication-related features

### Debugging Tips

```javascript
// See what's actually being used
qaFlags.debug()

// Check a specific flag
hasFeatureFlag(qaFlags.FeatureFlags.CCRA_MODULE)

// Verify localStorage state directly
localStorage.getItem('qa_feature_flags')
```

## QA Testing Workflow

## Troubleshooting

### "Feature not changing after setting flag"

**Solution**: Some features require a page refresh. Try:
```javascript
qaFlags.set(qaFlags.FeatureFlags.CCRA_MODULE, true)
location.reload()
```

### "Lost my overrides"

**Cause**: Browser data was cleared or using incognito mode

**Solution**: QA overrides are lost when localStorage is cleared. Set them again or save your config:
```javascript
// Save your config
const myConfig = qaFlags.list()
console.log(JSON.stringify(myConfig))

// Later, restore it
qaFlags.set(qaFlags.FeatureFlags.CCRA_MODULE, true)
qaFlags.set(qaFlags.FeatureFlags.JN_ENABLED, false)
```

### "Want to share my configuration"

**Solution**: Export and share the JSON:
```javascript
// QA Engineer 1: Export config
JSON.stringify(qaFlags.list())
// Copy output: {"CCRA_MODULE":true,"JN_ENABLED":false}

// QA Engineer 2: Import config
const config = {"CCRA_MODULE":true,"JN_ENABLED":false}
Object.entries(config).forEach(([flag, enabled]) => 
  qaFlags.set(qaFlags.FeatureFlags[flag], enabled)
)
```

## For Developers

### Adding a New Feature Flag

1. Add to enum in `/app/src/util/feature-flags.ts`:
```typescript
export enum FeatureFlags {
  // ... existing flags
  MY_NEW_FEATURE = "MY_NEW_FEATURE",
}
```

2. Add to environment variables:
```bash
NEXT_PUBLIC_FEATURE_FLAGS="JN_ENABLED,MY_NEW_FEATURE"
```

3. Use in code:
```typescript
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";

if (hasFeatureFlag(FeatureFlags.MY_NEW_FEATURE)) {
  // Show new feature
}
```

4. QA can now test it:
```javascript
qaFlags.set(qaFlags.FeatureFlags.MY_NEW_FEATURE, true)
```

### Best Practices

- ✅ **Always check feature flags**, never assume
- ✅ **Provide fallback UI** when features are disabled
- ✅ **Document new flags** in this file
- ✅ **Test both states** (enabled/disabled) before deploying
- ⚠️ **Don't use for security** - Client-side flags can be bypassed

## Security Considerations

- ⚠️ **Not for authorization**: QA flags are client-side only and can be manipulated
- ✅ **Safe for UI features**: Perfect for showing/hiding UI elements
- ❌ **NOT safe for permissions**: Always check permissions server-side
- ✅ **Audit trail**: Environment flags are version-controlled

## Support

For questions or issues:
- Check the console with `qaFlags.debug()`
- Verify localStorage: `localStorage.getItem('qa_feature_flags')`
- Contact the development team if flags aren't working as expected

