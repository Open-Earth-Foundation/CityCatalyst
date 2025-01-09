/**
 * This file contains all the recipes that are used to define the styles of the components.
 */

import { defineRecipe } from "@chakra-ui/react";

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

export const linkRecipe = defineRecipe({
  base: {
    color: "brand.secondary",
  },
});
