import {
  defineConfig,
  defaultBaseConfig,
  createSystem,
} from "@chakra-ui/react";

import { buttonRecipe } from "./theme/recipes/button.recipe";
import { separatorRecipe } from "./theme/recipes/separator.recipe";
import {
  accordionRecipe,
  cardRecipe,
  formRecipe,
  headingRecipe,
  linkRecipe,
  progressRecipe,
  switchRecipe,
  tabsRecipe,
  tagRecipe,
  textareaRecipe,
  textRecipe,
  tooltipRecipe,
} from "./theme/recipes";

export enum SectorColors {
  I = "#5785F4",
  II = "#DF2222",
  III = "#F28C37",
  IV = "#2DD05B",
  V = "#C6C61D",
}

export enum SubSectorColors {
  "V.1" = "#38A857",
  "V.2" = "#0E5221",
  "V.3" = "#149037",
}

const customConfig = defineConfig({
  theme: {
    tokens: {
      colors: {
        brand: {
          primary: { value: "#001EA7" },
          secondary: { value: "#2351DC" },
        },

        content: {
          primary: { value: "#00001F" },
          secondary: { value: "#00001F" },
          tertiary: { value: "#4B4C63" },
          link: { value: "#2351DC" },
          alternative: { value: "#001EA7" },
        },

        sectors: {
          I: { value: SectorColors.I },
          II: { value: SectorColors.II },
          III: { value: SectorColors.III },
          IV: { value: SectorColors.IV },
          V: { value: SectorColors.V },
        },

        semantic: {
          success: { value: "#24BE00" },
          successOverlay: { value: "#EFFDE5" },
          warning: { value: "#C98300" },
          warningOverlay: { value: "#FEF8E1" },
          danger: { value: "#F23D33" },
          dangerOverlay: { value: "#FFEAEE" },
          info: { value: "#2351DC" },
        },

        base: {
          light: { value: "#FFFFFF" },
          dark: { value: "#00001F" },
        },

        border: {
          neutral: { value: "#D7D8FA" },
          overlay: { value: "#E6E7FF" },
        },
        divider: {
          neutral: { value: "#F0F0F0" },
        },

        background: {
          default: { value: "#FFFFFF" },
          neutral: { value: "#E8EAFB" },
          alternative: { value: "#EFFDE5" },
          overlay: { value: "#C5CBF5" },
          transparentGrey: {
            value: "rgba(232 }, 234, 251, 0.20)",
            backgroundLight: { value: "#FAFAFA" },
            backgroundGreyFlat: { value: "#FAFBFE" },
            backgroundLoading: { value: "#E8EAFB" },
            alternativeLight: { value: "#F9FAFE" },
          },

          interactive: {
            primary: { value: "#008600" },
            primaryLight: { value: "#61c261" },
            accent: { value: "#5FE500" },
            secondary: { value: "#2351DC" },
            tertiary: { value: "#24BE00" },
            quaternary: { value: "#F17105" },
            control: { value: "#7A7B9A" },
            connected: { value: "#FA7200" },
          },

          sentiment: {
            positiveOverlay: { value: "#EFFDE5" },
            positiveLight: { value: "#f0f7eb" },
            positiveDark: { value: "#b9cfa9" },
            positiveDefault: { value: "#24BE00" },
            warningDefault: { value: "#C98300" },
            warningOverlay: { value: "#FEF8E1" },
            negativeDefault: { value: "#F23D33" },
            negativeOverlay: { value: "#FFEAEE" },
          },

          brandScheme: {
            100: { value: "#C5CBF5" },
            500: { value: "#2351DC" },
          },
        },

        body: { value: "#232640" },
      },

      fonts: {
        heading: { value: "var(--font-poppins)" },
        body: { value: "var(--font-opensans)" },
      },

      fontSizes: {
        display: {
          xl: { value: "140px" },
          lg: { value: "57px" },
          md: { value: "45px" },
          sm: { value: "36px" },
        },

        headline: {
          lg: { value: "32px" },
          md: { value: "28px" },
          sm: { value: "24px" },
        },

        title: {
          lg: { value: "22px" },
          md: { value: "16px" },
          sm: { value: "14px" },
        },

        label: {
          lg: { value: "14px" },
          md: { value: "12px" },
          sm: { value: "11px" },
        },

        body: {
          xl: { value: "22px" },
          lg: { value: "16px" },
          md: { value: "14px" },
          sm: { value: "12px" },
        },

        button: {
          lg: { value: "20px" },
          md: { value: "14px" },
          sm: { value: "12px" },
        },

        caption: { value: "12px" },
        overline: { value: "10px" },
      },

      fontWeights: {
        hairline: { value: 100 },
        thin: { value: 200 },
        light: { value: 300 },
        regular: { value: 400 },
        medium: { value: 500 },
        semibold: { value: 600 },
        bold: { value: 700 },
      },

      lineHeights: {
        normal: { value: "normal" },
        none: { value: 1 },
        "64": { value: "64px" },
        "52": { value: "52px" },
        "44": { value: "44px" },
        "40": { value: "40px" },
        "36": { value: "36px" },
        "32": { value: "32px" },
        "28": { value: "28px" },
        "24": { value: "24px" },
        "20": { value: "20px" },
        "16": { value: "16px" },
      },

      letterSpacings: {
        normal: { value: 0 },
        wide: { value: "0.5px" },
        wider: { value: "1.25px" },
        widest: { value: "1.5px" },
      },

      spacing: {
        xs: { value: "4px" },
        s: { value: "8px" },
        m: { value: "16px" },
        l: { value: "24px" },
        xl: { value: "32px" },
        xxl: { value: "40px" },
        "xxl-2": { value: "48px" },
        "xxl-3": { value: "56px" },
        "xxl-4": { value: "64px" },
        "xxl-5": { value: "72px" },
        "xxl-6": { value: "80px" },
      },

      shadows: {
        "1dp": {
          value: "0px 1px 2px -1px #0000001A, 0px 1px 3px 0px #00001F1A",
        },
        "2dp": {
          value: "0px 2px 4px -2px #0000001A, 0px 4px 6px -1px #0000001A",
        },
        "4dp": {
          value: "0px 4px 6px -4px #0000001A, 0px 10px 15px -3px #0000001A",
        },
        "8dp": {
          value: "0px 8px 10px -6px #0000001A, 0px 20px 25px -5px #0000001A",
        },
        "12dp": { value: "0px 25px 50px -12px #00000040" },
      },

      borders: {
        inputBox: { value: " 1px solid #D7D8FB" },
      },
      /*
      borderRadius: {
        full: { value: "50%" },
        minimal: { value: "4px" },
        rounded: { value: "8px" },
        "rounded-xl": { value: "16px" },
        "rounded-xxl": { value: "20px" },
      },
      */
      /*
      breakpoints: {
        xs: "360px",
        sm: "600px",
        md: "905px",
        lg: "1240px",
        xl: "1440px",
      },
      */
    },

    recipes: {
      button: buttonRecipe,
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
      seperator: separatorRecipe,
    },
  },
});

const system = createSystem(defaultBaseConfig, customConfig);
export default system;
