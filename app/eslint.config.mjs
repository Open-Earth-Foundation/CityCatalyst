import { defineConfig, globalIgnores } from "eslint/config";
import i18next from "eslint-plugin-i18next";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  i18next.configs["flat/recommended"],
  globalIgnores([
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
  ]),
  {
    // Pin the React version instead of "detect" (eslint-config-next's default):
    // eslint-plugin-react's auto-detection calls context.getFilename(), which
    // doesn't exist on ESLint 9's flat-config context object and throws.
    settings: {
      react: {
        version: "19.2.8",
      },
    },
  },
  {
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // .cjs files are explicitly CommonJS — require() is the only valid
    // syntax there, ESM import statements aren't legal in this extension.
    files: ["**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
