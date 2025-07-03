import { createSystem, defaultConfig } from "@chakra-ui/react";
import { recipes } from "./index";
import { SectorColors } from "../custom-colors";

export const appTheme = createSystem(defaultConfig, {
  disableLayers: true,
  conditions: {
    blue_theme: "&:is([data-theme=blue_theme])",
    light_brown_theme: "&:is([data-theme=light_brown_theme])",
    dark_orange_theme: "&:is([data-theme=dark_orange_theme])",
    green_theme: "&:is([data-theme=green_theme])",
    light_blue_theme: "&:is([data-theme=light_blue_theme])",
    violet_theme: "&:is([data-theme=violet_theme])",
  },
  globalCss: {
    html: {
      colorPalette: "brand",
    },
    body: {
      bg: "background.backgroundLight",
    },
    textarea: {
      bg: "base.light !important",
    },
  },
  theme: {
    semanticTokens: {
      colors: {
        brand: {
          solid: { value: "{colors.brand.500}" },
          contrast: { value: "{colors.brand.100}" },
          fg: { value: "{colors.brand.700}" },
          muted: { value: "{colors.brand.100}" },
          subtle: { value: "{colors.brand.200}" },
          emphasized: { value: "{colors.brand.300}" },
          focusRing: { value: "{colors.brand.500}" },
        },
        content: {
          alternative: {
            value: {
              base: "{colors.blue_theme.contentAlternative}",
              _blue_theme: "{colors.blue_theme.content.alternative}",
              _light_brown_theme:
                "{colors.light_brown_theme.content.alternative}",
              _dark_orange_theme:
                "{colors.dark_orange_theme.content.alternative}",
              _green_theme: "{colors.green_theme.content.alternative}",
              _light_blue_theme:
                "{colors.light_blue_theme.content.alternative}",
              _violet_theme: "{colors.violet_theme.content.alternative}",
            },
          },
          link: {
            value: {
              base: "{colors.blue_theme.content.link}",
              _blue_theme: "{colors.blue_theme.content.link}",
              _light_brown_theme: "{colors.light_brown_theme.content.link}",
              _dark_orange_theme: "{colors.dark_orange_theme.content.link}",
              _green_theme: "{colors.green_theme.content.link}",
              _light_blue_theme: "{colors.light_blue_theme.content.link}",
              _violet_theme: "{colors.violet_theme.content.link}",
            },
          },
          tertiary: {
            value: {
              base: "{colors.blue_theme.content.tertiary}",
              _blue_theme: "{colors.blue_theme.content.tertiary}",
              _light_brown_theme: "{colors.light_brown_theme.content.tertiary}",
              _dark_orange_theme: "{colors.dark_orange_theme.content.tertiary}",
              _green_theme: "{colors.green_theme.content.tertiary}",
              _light_blue_theme: "{colors.light_blue_theme.content.tertiary}",
              _violet_theme: "{colors.violet_theme.content.tertiary}",
            },
          },
          secondary: {
            value: {
              base: "{colors.blue_theme.content.secondary}",
              _blue_theme: "{colors.blue_theme.content.secondary}",
              _light_brown_theme:
                "{colors.light_brown_theme.content.secondary}",
              _dark_orange_theme:
                "{colors.dark_orange_theme.content.secondary}",
              _green_theme: "{colors.green_theme.content.secondary}",
              _light_blue_theme: "{colors.light_blue_theme.content.secondary}",
              _violet_theme: "{colors.violet_theme.content.secondary}",
            },
          },
          primary: {
            value: {
              base: "{colors.blue_theme.content.primary}",
              _blue_theme: "{colors.blue_theme.content.primary}",
              _light_brown_theme: "{colors.light_brown_theme.content.primary}",
              _dark_orange_theme: "{colors.dark_orange_theme.content.primary}",
              _green_theme: "{colors.green_theme.content.primary}",
              _light_blue_theme: "{colors.light_blue_theme.content.primary}",
              _violet_theme: "{colors.violet_theme.content.primary}",
            },
          },
        },
        interactive: {
          secondary: {
            value: {
              base: "{colors.blue_theme.interactive.secondary}",
              _blue_theme: "{colors.blue_theme.interactive.secondary}",
              _light_brown_theme:
                "{colors.light_brown_theme.interactive.secondary}",
              _dark_orange_theme:
                "{colors.dark_orange_theme.interactive.secondary}",
              _green_theme: "{colors.green_theme.interactive.secondary}",
              _light_blue_theme:
                "{colors.light_blue_theme.interactive.secondary}",
              _violet_theme: "{colors.violet_theme.interactive.secondary}",
            },
          },
        },
        background: {
          default: {
            value: {
              base: "{colors.background.default}",
              _blue_theme: "{colors.blue_theme.background.default}",
              _light_brown_theme:
                "{colors.light_brown_theme.background.default}",
              _darko_range_theme:
                "{colors.dark_orange_theme.background.default}",
              _green_theme: "{colors.green_theme.background.default}",
              _light_blue_theme: "{colors.light_blue_theme.background.default}",
              _violet_theme: "{colors.violet_theme.background.default}",
            },
          },
          neutral: {
            value: {
              base: "{colors.background.neutral}",
              _blue_theme: "{colors.blue_theme.background.neutral}",
              _light_brown_theme:
                "{colors.light_brown_theme.background.neutral}",
              _dark_orange_theme:
                "{colors.dark_orange_theme.background.neutral}",
              _green_theme: "{colors.green_theme.background.neutral}",
              _light_blue_theme: "{colors.light_blue_theme.background.neutral}",
              _violet_theme: "{colors.violet_theme.background.neutral}",
            },
          },
          alternative: {
            value: {
              base: "{colors.background.alternative}",
              _blue_theme: "{colors.blue_theme.background.alternative}",
              _light_brown_theme:
                "{colors.light_brown_theme.background.alternative}",
              _dark_orange_theme:
                "{colors.dark_orange_theme.background.alternative}",
              _green_theme: "{colors.green_theme.background.alternative}",
              _light_blue_theme:
                "{colors.light_blue_theme.background.alternative}",
              _violet_theme: "{colors.violet_theme.background.alternative}",
            },
          },
          overlay: {
            value: {
              base: "{colors.background.overlay}",
              _blue_theme: "{colors.blue_theme.background.overlay}",
              _light_brown_theme:
                "{colors.light_brown_theme.background.overlay}",
              _dark_orange_theme:
                "{colors.dark_orange_theme.background.overlay}",
              _green_theme: "{colors.green_theme.background.overlay}",
              _light_blue_theme: "{colors.light_blue_theme.background.overlay}",
              _violet_theme: "{colors.violet_theme.background.overlay}",
            },
          },
        },
        border: {
          neutral: {
            value: {
              base: "{colors.border.neutral}",
              _blue_theme: "{colors.blue_theme.border.neutral}",
              _light_brown_theme: "{colors.light_brown_theme.border.neutral}",
              _dark_orange_theme: "{colors.dark_orange_theme.border.neutral}",
              _green_theme: "{colors.green_theme.border.neutral}",
              _light_blue_theme: "{colors.light_blue_theme.border.neutral}",
              _violet_theme: "{colors.violet_theme.border.neutral}",
            },
          },
          overlay: {
            value: {
              base: "{colors.border.overlay}",
              _blue_theme: "{colors.blue_theme.border.overlay}",
              _light_brown_theme: "{colors.light_brown_theme.border.overlay}",
              _dark_orange_theme: "{colors.dark_orange_theme.border.overlay}",
              _green_theme: "{colors.green_theme.border.overlay}",
              _light_blue_theme: "{colors.light_blue_theme.border.overlay}",
              _violet_theme: "{colors.violet_theme.border.overlay}",
            },
          },
        },
        base: {
          light: {
            value: {
              base: "{colors.base.light}",
              _blue_theme: "{colors.blue_theme.base.light}",
              _light_brown_theme: "{colors.light_brown_theme.base.light}",
              _dark_orange_theme: "{colors.dark_orange_theme.base.light}",
              _green_theme: "{colors.green_theme.base.light}",
              _light_blue_theme: "{colors.light_blue_theme.base.light}",
              _violet_theme: "{colors.violet_theme.base.light}",
            },
          },
          dark: {
            value: {
              base: "{colors.base.dark}",
              _blue_theme: "{colors.blue_theme.base.dark}",
              _light_brown_theme: "{colors.light_brown_theme.base.dark}",
              _dark_orange_theme: "{colors.dark_orange_theme.base.dark}",
              _green_theme: "{colors.green_theme.base.dark}",
              _light_blue_theme: "{colors.light_blue_theme.base.dark}",
              _violet_theme: "{colors.violet_theme.base.dark}",
            },
          },
        },
      },
    },
    tokens: {
      colors: {
        blue_theme: {
          content: {
            alternative: { value: "#001EA7" },
            link: { value: "#2351DC" },
            tertiary: {
              value: "#7A7B9A",
            },
            secondary: {
              value: "#232640",
            },
            primary: {
              value: "#00001F",
            },
          },
          background: {
            default: { value: "#FFFFFF" },
            neutral: { value: "#E8EAFB" },
            alternative: { value: "#EFFDE5" }, // #C5CBF5
            overlay: { value: "#C5CBF5" },
          },
          border: {
            neutral: { value: "#D7D8FA" },
            overlay: { value: "#E6E7FF" },
          },
          base: {
            light: { value: "#FFFFFF" },
            dark: { value: "#00001F" },
          },
          interactive: {
            secondary: { value: "#2351DC" },
          },
        },
        light_brown_theme: {
          content: {
            alternative: { value: "#8E7109" },
            link: { value: "#8E7109" },
            tertiary: {
              value: "#8a8a8a",
            },
            secondary: {
              value: "#323232",
            },
            primary: {
              value: "#101010",
            },
          },
          background: {
            default: { value: "#FFFFFF" },
            overlay: { value: "#EEDC9B" },
            alternative: {
              value: "#FAEBB8",
            },
            neutral: { value: "#F4E8BE" },
          },
          border: {
            neutral: { value: "#F4E4A9" },
            overlay: { value: "#FFEEB2" },
          },
          base: {
            light: { value: "#FFFFFF" },
            dark: { value: "#000000" },
          },
          interactive: {
            secondary: { value: "#8E7109" },
          },
        },
        dark_orange_theme: {
          content: {
            alternative: { value: "#B0661C" },
            link: { value: "#B0661C" },
            tertiary: {
              value: "#8a8a8a",
            },
            secondary: {
              value: "#323232",
            },
            primary: {
              value: "#101010",
            },
          },
          border: {
            neutral: { value: "#F4CFA9" },
            overlay: { value: "#EEC49B" },
          },
          interactive: {
            secondary: { value: "#B0661C" },
          },
          base: {
            light: { value: "#FFFFFF" },
            dark: { value: "#000000" },
          },
          background: {
            default: { value: "#FFFFFF" },
            overlay: { value: "#EEC49B" },
            alternative: {
              value: "#FAD9B8",
            },
            neutral: { value: "#F4D9BE" },
          },
        },
        green_theme: {
          content: {
            alternative: { value: "#739F19" },
            link: { value: "#739F19" },
            tertiary: {
              value: "#8a8a8a",
            },
            secondary: {
              value: "#323232",
            },
            primary: {
              value: "#101010",
            },
          },
          border: {
            neutral: { value: "#DBF4A9" },
            overlay: { value: "#E5FFB2" },
          },
          base: {
            light: { value: "#FFFFFF" },
            dark: { value: "#000000" },
          },
          background: {
            default: { value: "#FFFFFF" },
            overlay: { value: "#D2EE9B" },
            alternative: {
              value: "#E4FAB8",
            },
            neutral: { value: "#E2F4BE" },
          },
          interactive: {
            secondary: { value: "#739F19" },
          },
        },
        light_blue_theme: {
          content: {
            alternative: { value: "#0D9EA0" },
            link: { value: "#0D9EA0" },
            tertiary: {
              value: "#8a8a8a",
            },
            secondary: {
              value: "#323232",
            },
            primary: {
              value: "#101010",
            },
          },
          border: {
            neutral: { value: "#A9F3F4" },
            overlay: { value: "#B2FEFF" },
          },
          base: {
            light: { value: "#FFFFFF" },
            dark: { value: "#000000" },
          },
          background: {
            default: { value: "#FFFFFF" },
            overlay: { value: "#9BECEE" },
            alternative: {
              value: "#B8F8FA",
            },
            neutral: { value: "#BEF3F4" },
          },
          interactive: {
            secondary: { value: "#0D9EA0" },
          },
        },
        violet_theme: {
          content: {
            alternative: { value: "#7F1CB0" },
            link: { value: "#7F1CB0" },
            tertiary: {
              value: "#8a8a8a",
            },
            secondary: {
              value: "#323232",
            },
            primary: {
              value: "#101010",
            },
          },
          border: {
            neutral: { value: "#DBA9F4" },
            overlay: { value: "#E5B2FF" },
          },
          base: {
            light: { value: "#FFFFFF" },
            dark: { value: "#000000" },
          },
          background: {
            default: { value: "#FFFFFF" },
            overlay: { value: "#D29BEE" },
            alternative: {
              value: "#E4B8FA",
            },
            neutral: { value: "#E2BEF4" },
          },
          interactive: {
            secondary: { value: "#A200B5" },
          },
        },

        brand: {
          primary: {
            value: "#001EA7",
          },
          secondary: { value: "#2351DC" },
          50: { value: "#f5f7fd" },
          100: { value: "#d8e0f9" },
          200: { value: "#b5c5f3" },
          300: { value: "#8ba4ed" },
          400: { value: "#7391e9" },
          500: { value: "#2351DC" },
          600: { value: "#345fdf" },
          700: { value: "#1f48c4" },
          800: { value: "#1a3da6" },
          900: { value: "#001EA7" },
        },

        content: {
          primary: { value: "#00001F" }, // valid
          secondary: { value: "#232640" }, // valid
          tertiary: { value: "#7A7B9A" }, // validated
          link: { value: "#2351DC" }, // validated
          alternative: { value: "#001EA7" }, // validated
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
          default: { value: "#FFFFFF" }, // validated
          neutral: { value: "#E8EAFB" }, // validated
          alternative: { value: "#EFFDE5" }, // validated
          overlay: { value: "#C5CBF5" }, // validated
          transparentGrey: { value: "rgba(232, 234, 251, 0.20)" },
          backgroundLight: { value: "#FAFAFA" },
          backgroundGreyFlat: { value: "#FAFBFE" },
          backgroundLoading: { value: "#E8EAFB" },
        },

        interactive: {
          primary: { value: "#008600" }, // stays the same
          primaryLight: { value: "#61c261" },
          accent: { value: "#5FE500" }, // stays the same
          secondary: {
            value: "#2351DC",
          }, // validated
          tertiary: { value: "#24BE00" }, // stays the same  might not need the rest in the group.
          quaternary: { value: "#F17105" },
          control: { value: "#7A7B9A" },
          connected: { value: "#FA7200" },
        },

        sentiment: {
          positiveOverlay: { value: "#EFFDE5" }, // stays the same
          positiveLight: { value: "#f0f7eb" },
          positiveDark: { value: "#b9cfa9" },
          positiveDefault: { value: "#24BE00" }, // stays the same
          warningDefault: { value: "#F9A200" }, // validated changed but stays the same across themes.
          warningOverlay: { value: "#FEF8E1" }, // stays the same
          negativeDefault: { value: "#F23D33" }, // stays the same
          negativeOverlay: { value: "#FFEAEE" }, // stays the same
        },

        brandScheme: {
          100: { value: "#C5CBF5" },
          500: { value: "#2351DC" },
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

      radii: {
        full: { value: "50%" },
        minimal: { value: "4px" },
        rounded: { value: "8px" },
        "rounded-xl": { value: "16px" },
        "rounded-xxl": { value: "20px" },
      },
      borders: {
        inputBox: { value: "1px solid #D7D8FB" },
      },
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
    recipes,
  },
});
