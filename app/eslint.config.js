import next from "eslint-config-next";
import i18next from "eslint-plugin-i18next";

export default [
  next(),
  {
    plugins: {
      i18next,
    },
    rules: {
      // Add custom rules here if needed
    },
  },
];
