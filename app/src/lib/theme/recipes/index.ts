/**
 * This file contains all the recipes that are used to define the styles of the components.
 */

import { defineRecipe } from "@chakra-ui/react";
import { buttonRecipe } from "./button.recipe";
import { separatorRecipe } from "./separator.recipe";

// define a recipe for the link (anchor tag)
export const linkRecipe = defineRecipe({
  base: {
    color: "brand.secondary",
  },
});

// define a recipe for the tag
export const tagRecipe = defineRecipe({
  base: {},

  variants: {
    brand: {
      container: {
        px: 3,
        py: 1,
        borderRadius: "16px",
        borderColor: "background.neutral",
        borderWidth: 1,
        color: "background.neutral",
      },
      label: {
        color: "content.secondary",
        fontFamily: "heading",
        fontSize: "14px",
        lineHeight: "20px",
        letterSpacing: "0.5px",
        borderWidth: 0,
        mt: -0.5,
      },
    },
    filled: {
      container: {
        px: 4,
        py: 1,
        borderRadius: "16px",
        bgColor: "background.neutral",
      },
      label: {
        color: "content.alternative",
      },
    },
    success: {
      container: {
        px: 4,
        py: 1,
        borderRadius: "16px",
        borderWidth: 1,
        borderColor: "sentiment.positiveDefault",
        bgColor: "sentiment.positiveOverlay",
        color: "sentiment.positiveDefault",
        fontWeight: 500,
      },
      label: {
        color: "sentiment.positiveDefault",
      },
    },
    warning: {
      container: {
        px: 4,
        py: 1,
        borderRadius: "16px",
        borderWidth: 1,
        borderColor: "sentiment.warningDefault",
        bgColor: "sentiment.warningOverlay",
        color: "sentiment.warningDefault",
      },
      label: {
        color: "sentiment.warningDefault",
      },
    },
    low: {
      container: {
        bgColor: "sentiment.warningOverlay",
        borderColor: "sentiment.warningDefault",
        borderWidth: 1,
        borderRadius: "16px",
      },
      label: {
        color: "sentiment.warningDefault",
        fontWeight: "medium",
      },
    },
    medium: {
      container: {
        bgColor: "background.neutral",
        borderColor: "content.link",
        borderWidth: 1,
        borderRadius: "16px",
      },
      label: {
        color: "content.link",
        fontWeight: "medium",
      },
    },
    high: {
      container: {
        bgColor: "sentiment.positiveOverlay",
        borderColor: "interactive.tertiary",
        borderWidth: 1,
        borderRadius: "16px",
      },
      label: {
        color: "interactive.tertiary",
        fontWeight: "medium",
      },
    },
  },
  defaultVariants: {
    brand: "label",
  },
});

// define a recipe for the card
export const cardRecipe = defineRecipe({
  base: {
    borderRadius: 8,
    px: 6,
    py: 8,
  },
});

// define a recipe for the tooltip
export const tooltipRecipe = defineRecipe({
  base: {
    bg: "content.secondary",
    color: "base.light",
    borderRadius: 8,
    px: 4,
    py: 2,
  },
});

// define a recipe for the tabs
export const tabsRecipe = defineRecipe({
  base: {
    backgroundColor: "background.neutral",
  },
  variants: {
    true: {
      line: {
        tab: {
          borderColor: "interactive.secondary",
          _selected: {
            color: "content.link",
            borderColor: "content.link",
            fontWeight: "bold",
          },
        },
      },
    },
  },
});

// define a recipe for the accordion
export const accordionRecipe = defineRecipe({
  variants: {
    brand: {
      container: {
        borderRadius: 8,
      },
      button: {
        borderRadius: "8px",
      },
    },
  },
  defaultVariants: {
    brand: "container",
  },
});

// define a recipe for the progress
export const progressRecipe = defineRecipe({
  base: {
    bg: "#24BE00",
  },
});

// define a recipe for the Form
export const formRecipe = defineRecipe({
  variants: {
    brand: {
      container: {
        label: {
          fontFamily: "heading",
          fontWeight: "500",
          lineHeight: "20px",
          letterSpacing: "0.5px",
          fontSize: "14px",
          mb: 4,
        },
      },
    },
  },
  defaultVariants: {
    brand: "container",
  },
});

// define a recipe for the text
export const textRecipe = defineRecipe({
  variants: {
    spaced: {
      true: {
        fontWeight: "medium",
        lineHeight: "20",
        letterSpacing: "wide",
      },
    },
    card: {
      true: {
        fontSize: "label.lg",
        fontWeight: "medium",
        color: "content.secondary",
        textTransform: "none",
        whiteSpace: "normal",
        textAlign: "left",
      },
    },
  },
});

// define a recipe for the Heading
export const headingRecipe = defineRecipe({
  variants: {
    lg: {
      true: {
        fontSize: "24px",
        fontWeight: "bold",
        lineHeight: "32px",
      },
    },
  },
  defaultVariants: {
    lg: true,
  },
});

// define a recipe for the Switch
export const switchRecipe = defineRecipe({
  variants: {
    brand: {
      track: {
        borderRadius: "16px",
        bg: "background.neutral",
        _checked: {
          bg: "interactive.secondary",
        },
      },
      container: {
        mb: "0 !important",
      },
    },
  },
  defaultVariants: {
    brand: "track",
  },
});

// define a recipe for the Textarea
export const textareaRecipe = defineRecipe({
  variants: {
    brand: {
      container: {
        bg: "background.neutral",
        borderColor: "background.neutral",
        borderRadius: 8,
        color: "content.secondary",
        _focus: {
          borderColor: "interactive.secondary",
        },
      },
    },
  },
  defaultVariants: {
    brand: "container",
  },
});

export const badgeRecipe = defineRecipe({
  variants: {
    brand: {
      container: {
        color: "content.secondary",
        borderWidth: "1px",
        borderColor: "border.neutral",
        py: 1,
        px: 3,
        borderRadius: "16px",
        bg: "base.light",
      },
    },
  },
  defaultVariants: {
    brand: "container",
  },
});

export const recipes = {
  button: buttonRecipe,
  badge: badgeRecipe,
  link: linkRecipe,
  tag: tagRecipe,
  card: cardRecipe,
  tooltip: tooltipRecipe,
  tab: tabsRecipe,
  accordion: accordionRecipe,
  progress: progressRecipe,
  form: formRecipe,
  text: textRecipe,
  heading: headingRecipe,
  switch: switchRecipe,
  textarea: textareaRecipe,
  separator: separatorRecipe,
};
