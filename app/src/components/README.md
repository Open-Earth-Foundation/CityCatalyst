# @oef/components

A TypeScript package containing text/typography components and module components from CityCatalyst. This package provides consistent UI components built on top of Chakra UI.

## Installation

```bash
npm install @oef/components
```

## Peer Dependencies

This package requires the following peer dependencies:

```bash
npm install react react-dom @chakra-ui/react @emotion/react i18next
```

## Usage

```tsx
import { 
  BlueSubtitle, 
  BodyLarge, 
  DisplayMedium, 
  HeadlineSmall,
  TitleLarge,
  GHGIDashboard,
  HIAPDashboard,
  CCRADashboard
} from '@oef/components';

function MyComponent() {
  return (
    <div>
      <DisplayMedium>Main Heading</DisplayMedium>
      <HeadlineSmall>Section Title</HeadlineSmall>
      <BodyLarge>This is some body text content.</BodyLarge>
      <BlueSubtitle t={t} text="subtitle.key" />
      
      {/* Module Components */}
      <GHGIDashboard />
      <HIAPDashboard />
      <CCRADashboard />
    </div>
  );
}
```

## Available Components

### Display Components
- `DisplaySmall` - Small display text
- `DisplayMedium` - Medium display text  
- `DisplayLarge` - Large display text

### Headline Components
- `HeadlineSmall` - Small headline
- `HeadlineMedium` - Medium headline
- `HeadlineLarge` - Large headline

### Title Components
- `TitleSmall` - Small title
- `TitleMedium` - Medium title
- `TitleLarge` - Large title

### Body Text Components
- `BodySmall` - Small body text
- `BodyMedium` - Medium body text
- `BodyLarge` - Large body text
- `BodyXLarge` - Extra large body text

### Label Components
- `LabelMedium` - Medium label
- `LabelLarge` - Large label

### Button Text Components
- `ButtonSmall` - Small button text
- `ButtonMedium` - Medium button text

### Special Components
- `BlueSubtitle` - Blue colored subtitle with i18n support
- `Overline` - Overline text component

### Module Components
- `GHGIDashboard` 
- `HIAPDashboard` 
- `CCRADashboard` 

## Development

This package references the original components in the main CityCatalyst app, so you can continue editing them in their original location at `app/src/components/Texts/` and `app/src/components/Modules/`. Changes will be automatically reflected when the package is rebuilt.

### Building the Package

```bash
npm run build
```

### Cleaning Build Artifacts

```bash
npm run clean
```

## License

LGPL

## Using the package locally (without publishing)

### Option A: npm pack (recommended)

Create a tarball from the package and install it in the consumer:

```bash
# From the package folder
cd CityCatalyst/app/src/components
npm run build
npm pack            # → produces something like oef-components-1.0.4.tgz

# In the consuming app
cd ../../../demo-oef-components
npm install ../CityCatalyst/app/src/components/@oef/components-*.tgz
```

This mimics a real npm install (no nested node_modules in the package), and is closest to what you'll publish.

### Option B: file: path

```bash
cd demo-oef-components
npm pkg set dependencies.@oef/components="file:../CityCatalyst/app/src/components"
npm install
```

## Publishing to npm

1. Log in with an account belonging to the oef organization.

```bash
npm login
```

2. Ensure a clean build and bump version:

```bash
cd CityCatalyst/app/src/components
npm ci
npm run clean && npm run build
npm version patch   # or minor/major
```

3. Publish (requires npm account with access):

```bash
npm publish --access public
```

Notes:
- This package ships compiled JS and type declarations from `dist/`.
- Verify `name` and `version` in `package.json` before publishing.

## Next.js + Chakra setup (in consumer)

Wrap your app with Chakra’s provider and pass a theme value:

```tsx
// app/providers.tsx
"use client";
import { ReactNode } from 'react';
import { ChakraProvider, createSystem, defaultConfig } from '@chakra-ui/react';
const appTheme = createSystem(defaultConfig, {});
export function Providers({ children }: { children: ReactNode }) {
  return <ChakraProvider value={appTheme}>{children}</ChakraProvider>;
}
```
