import { defineConfig, globalIgnores } from "eslint/config";
import i18next from "eslint-plugin-i18next";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactCompiler from "eslint-plugin-react-compiler";

// Package boundaries for the modular monolith (app/docs/ModularMonolith.md, §2).
// Each package may import only the packages listed here, and only through
// "@/modules/<package>". Severity is "warn" until CC-1184 has moved code into
// src/modules/; its last ticket switches it to "error".
const MODULE_DEPS = {
  shared: [],
  "ui-kit": ["shared"],
  identity: ["ui-kit", "shared"],
  events: ["identity", "ui-kit", "shared"],
  tenancy: ["identity", "events", "ui-kit", "shared"],
  registry: ["identity", "tenancy", "ui-kit", "shared"],
  records: ["identity", "tenancy", "ui-kit", "shared"],
  ghgi: [
    "identity",
    "tenancy",
    "registry",
    "records",
    "events",
    "ui-kit",
    "shared",
  ],
  ingestion: [
    "ghgi",
    "identity",
    "tenancy",
    "registry",
    "records",
    "events",
    "ui-kit",
    "shared",
  ],
  plan: [
    "ghgi",
    "ingestion",
    "identity",
    "tenancy",
    "registry",
    "records",
    "events",
    "ui-kit",
    "shared",
  ],
  shell: [
    "plan",
    "ghgi",
    "ingestion",
    "identity",
    "tenancy",
    "registry",
    "records",
    "events",
    "ui-kit",
    "shared",
  ],
};
const MODULE_BOUNDARY_SEVERITY = "warn";
const noDeepModuleImport = {
  regex: "^@/modules/[^/]+/.+",
  message:
    'Import a package only through its front door, "@/modules/<package>". Inside a package, use relative imports.',
};
const moduleBoundaries = [
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-restricted-imports": [
        MODULE_BOUNDARY_SEVERITY,
        { patterns: [noDeepModuleImport] },
      ],
    },
  },
  ...Object.entries(MODULE_DEPS).map(([pkg, allowed]) => {
    const forbidden = Object.keys(MODULE_DEPS).filter(
      (other) => other !== pkg && !allowed.includes(other),
    );
    const patterns = [noDeepModuleImport];
    if (forbidden.length > 0) {
      patterns.push({
        regex: `^@/modules/(${forbidden.join("|")})$`,
        message: `The "${pkg}" package may not import this package. Allowed: ${allowed.join(", ") || "none"}.`,
      });
    }
    return {
      files: [`src/modules/${pkg}/**/*.{ts,tsx,js,jsx}`],
      rules: {
        "no-restricted-imports": [MODULE_BOUNDARY_SEVERITY, { patterns }],
      },
    };
  }),
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  reactCompiler.configs.recommended,
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
  ...moduleBoundaries,
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
