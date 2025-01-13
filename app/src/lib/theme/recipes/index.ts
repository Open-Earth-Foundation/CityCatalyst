/**
 * This file contains all the recipes that are used to define the styles of the components.
 */

import { defineRecipe } from "@chakra-ui/react";

// define a recipe for the button
export const buttonRecipe = defineRecipe({
  // base styles for the button
  base: {
    textTransform: "uppercase",
    borderRadius: 50,
    fontFamily: "var(--font-poppins)",
    letterSpacing: "1.25px",
    lineHeight: "16px",
  },

  // variants for the button
  variants: {
    outline: {
      true: {
        border: "2px solid",
        borderColor: "interactive.secondary",
        color: "interactive.secondary",
        _hover: {
          borderColor: "#5a7be0",
          color: "#5a7be0",
        },
        _active: {
          borderColor: "#899ee0",
          color: "#899ee0",
        },
        _loading: {
          opacity: 0.8,
        },
      },
    },
    solid: {
      true: {
        bg: "interactive.secondary",
        color: "white",
        _hover: {
          bg: "#5a7be0",
        },
        _active: {
          bg: "#899ee0",
        },
        _loading: {
          bg: "background.overlay",
          color: "content.link",
          _hover: {
            bg: "#5a7be0",
            color: "base.light",
          },
        },
      },
    },
    danger: {
      true: {
        bg: "sentiment.negativeDefault", // #F23D33
        color: "white",
        _hover: {
          bg: "#FF5F5F",
        },
        _active: {
          bg: "#E3241A",
        },
        _loading: {
          bg: "semantic.dangerOverlay",
          color: "base.dark",
          _hover: {
            bg: "#E3241A",
            color: "base.light",
          },
        },
      },
    },
    solidPrimary: {
      true: {
        bg: "sentiment.positiveOverlay",
        color: "interactive.primary",
        _hover: {
          bg: "sentiment.positiveLight",
          color: "interactive.primaryLight",
        },
        _active: {
          bg: "sentiment.positiveDark",
          color: "sentiment.positiveOverlay",
        },
        _loading: {
          opacity: 0.8,
          bg: "sentiment.positiveLight",
        },
      },
    },
    ghost: {
      true: {
        color: "content.link",
      },
    },
    lightGhost: {
      true: {
        color: "base.light",
        _hover: {
          bg: "background.transparentGrey",
          color: "base.light",
        },
      },
    },
    solidIcon: {
      true: {
        bgColor: "background.neutral",
        color: "interactive.secondary",
        _hover: {
          color: "white",
          bg: "#5a7be0",
        },
        _active: {
          bg: "#899ee0",
        },
        _loading: {
          opacity: 0.8,
          bg: "background.neutral",
        },
      },
    },
  },
});

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
        borderRadius: "full",
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
        borderRadius: "full",
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
        borderRadius: "full",
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
        borderRadius: "full",
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
        borderRadius: "full",
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
        borderRadius: "full",
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
        borderRadius: "full",
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
  variants: {
    true: {
      line: {
        tab: {
          borderColor: "#E6E7FF",
          _selected: {
            color: "interactive.secondary",
            borderColor: "interactive.secondary",
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
        borderRadius: "full",
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
