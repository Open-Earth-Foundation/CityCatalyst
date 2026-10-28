import type { Localized } from "./types";

/** The demo speaks two languages; anything else falls back to English. */
export type DemoLang = "en" | "pt";

export function demoLang(lng: string): DemoLang {
  return lng === "pt" ? "pt" : "en";
}

export function pick(text: Localized, lng: string): string {
  return text[demoLang(lng)];
}

export function localized(en: string, pt: string): Localized {
  return { en, pt };
}
