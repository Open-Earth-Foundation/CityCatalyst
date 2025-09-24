import { FlatCompat } from "@eslint/eslintrc";
import i18next from "eslint-plugin-i18next";

const compat = new FlatCompat({
  // import.meta.dirname is available after Node.js v20.11.0
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  ...compat.config({
    extends: ["next/core-web-vitals"],
    settings: {
      next: {
        rootDir: "app/",
      },
    },
  }),
  i18next.configs["flat/recommended"],
];

export default eslintConfig;
