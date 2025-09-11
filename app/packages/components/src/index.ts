// ============================================================================
// CITYCATALYST COMPONENTS PACKAGE
// ============================================================================
// This package exports text/typography components and module components from the main app.
// Components are copied during build to avoid code duplication while maintaining original locations.

// ============================================================================
// TEXT PRIMITIVES
// ============================================================================
import {BlueSubtitle} from "../../../src/components/Texts/BlueSubtitle";

export { BlueSubtitle } from "../../../src/components/Texts/BlueSubtitle";
export { 
  BodyXLarge, 
  BodyLarge, 
  BodyMedium, 
  BodySmall 
} from "../../../src/components/Texts/Body";
export { 
  ButtonSmall, 
  ButtonMedium 
} from "../../../src/components/Texts/Button";
export { 
  DisplaySmall, 
  DisplayMedium, 
  DisplayLarge 
} from "../../../src/components/Texts/Display";
export { 
  HeadlineSmall, 
  HeadlineMedium, 
  HeadlineLarge 
} from "../../../src/components/Texts/Headline";
export { 
  LabelLarge, 
  LabelMedium 
} from "../../../src/components/Texts/Label";
export { Overline } from "../../../src/components/Texts/Overline";
export { 
  TitleLarge, 
  TitleMedium, 
  TitleSmall 
} from "../../../src/components/Texts/Title";

// ============================================================================
// TYPE EXPORTS
// ============================================================================
export type { TFunction } from "i18next";
export type { TextProps } from "@chakra-ui/react";
export type { HeadingProps } from "@chakra-ui/react";
