import { describe, expect, it } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";

import { fallbackLng, languages } from "@/i18n/settings";

const LOCALES_DIR = path.join(process.cwd(), "src/i18n/locales");

type LocaleTree = { [key: string]: string | LocaleTree };

function readLocale(lng: string, namespace: string): LocaleTree | null {
  const file = path.join(LOCALES_DIR, lng, namespace);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as LocaleTree;
}

function flatten(tree: LocaleTree, prefix = ""): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      const fullKey = prefix + key;
      if (typeof value === "string") acc[fullKey] = value;
      else Object.assign(acc, flatten(value, `${fullKey}.`));
      return acc;
    },
    {},
  );
}

// i18next only fills {{name}} and <n></n> when the names match the code, so a
// translated placeholder name is shown to users as literal text.
function markupSignature(value: string): string {
  const placeholders = (value.match(/\{\{[^}]+\}\}/g) ?? []).map((p) =>
    p.replace(/\s/g, ""),
  );
  const tags = value.match(/<\/?\d+\s*\/?>/g) ?? [];
  return [...placeholders, ...tags].sort().join("|");
}

describe("translated locale files", () => {
  const namespaces = fs
    .readdirSync(path.join(LOCALES_DIR, fallbackLng))
    .filter((file) => file.endsWith(".json"));
  const targetLanguages = languages.filter((lng) => lng !== fallbackLng);

  it("keep the English interpolation placeholders and tags", () => {
    const mismatches: string[] = [];

    for (const namespace of namespaces) {
      const source = flatten(readLocale(fallbackLng, namespace) ?? {});
      for (const lng of targetLanguages) {
        const translated = flatten(readLocale(lng, namespace) ?? {});
        for (const [key, sourceValue] of Object.entries(source)) {
          const translatedValue = translated[key];
          if (translatedValue === undefined) continue;
          if (
            markupSignature(translatedValue) !== markupSignature(sourceValue)
          ) {
            mismatches.push(
              `${lng}/${namespace} ${key}: "${translatedValue}" (en: "${sourceValue}")`,
            );
          }
        }
      }
    }

    expect(mismatches).toEqual([]);
  });
});
