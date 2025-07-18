import { defineRecipe } from "@chakra-ui/react";

// define a recipe for the button
export const buttonRecipe = defineRecipe({
  // base styles for the button
  className: "chakra-button",
  base: {
    textTransform: "uppercase",
    borderRadius: 50,
    fontFamily: "var(--font-poppins)",
    letterSpacing: "1.25px",
    lineHeight: "16px",
    display: "flex",
    fontWeight: "bold",
  },

  // variants for the button
  variants: {
    variant: {
      outline: {
        border: "2px solid",
        borderColor: "interactive.secondary",
        color: "interactive.secondary",
        _hover: {
          opacity: 0.5,
          bg: "background.overlay",
        },
        _loading: {
          opacity: 0.8,
        },
      },
      solid: {
        bg: "content.alternative",
        color: "white",
        _hover: {
          opacity: 0.5,
          bg: "content.alternative",
        },
        _loading: {
          bg: "background.overlay",
          color: "content.link",
          _hover: {
            opacity: 0.5,
            color: "base.light",
          },
        },
      },
      danger: {
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
      solidPrimary: {
        bg: "sentiment.positiveOverlay",
        color: "content.alternative",
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
      ghost: {
        color: "base.light", // content.link
        bg: "transparent",
        outline: "none",
        border: "none",
        _hover: {
          bg: "background.transparentGrey",
          color: "base.light",
        },
        _active: {
          outline: "none",
          border: "none",
        },
      },
      lightGhost: {
        color: "base.light",
        outline: "none",
        border: "none",
        _hover: {
          bg: "background.transparentGrey",
          color: "base.light",
        },
        _active: {
          outline: "none",
          border: "none",
        },
      },
      solidIcon: {
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
    size: {
      sm: { padding: "4", fontSize: "12px" },
      lg: { padding: "8", fontSize: "24px" },
    },
  },
});
