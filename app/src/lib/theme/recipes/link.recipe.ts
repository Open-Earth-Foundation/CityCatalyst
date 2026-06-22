import { defineRecipe } from "@chakra-ui/react";

/** Top nav: white text dissolves to full opacity on hover (ease-out, 300ms). */
export const navLinkStyles = {
  color: "hsl(0, 0%, 100%)",
  opacity: 0.75,
  transitionProperty: "opacity",
  transitionDuration: "300ms",
  transitionTimingFunction: "ease-out",
  textDecoration: "none",
  _hover: {
    opacity: 1,
  },
  "& *": {
    color: "inherit",
    opacity: "inherit",
    transitionProperty: "inherit",
    transitionDuration: "inherit",
    transitionTimingFunction: "inherit",
  },
};

export const linkRecipe = defineRecipe({
  base: {
    color: "brand.secondary",
    textDecoration: "none",
  },
  variants: {
    variant: {
      nav: navLinkStyles,
    },
  },
});
