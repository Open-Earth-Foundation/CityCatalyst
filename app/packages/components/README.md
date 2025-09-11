# @citycatalyst/components

A TypeScript package containing text/typography components and module components from CityCatalyst. This package provides consistent UI components built on top of Chakra UI.

## Installation

```bash
npm install @citycatalyst/components
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

MIT
