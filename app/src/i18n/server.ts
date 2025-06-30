import i18next from "i18next";
import { getOptions } from "./settings";
import enEmails from "./locales/en/emails.json";
import deEmails from "./locales/de/emails.json";
import esEmails from "./locales/es/emails.json";
import frEmails from "./locales/fr/emails.json";
import ptEmails from "./locales/pt/emails.json";

// Create a static resource map
const resources = {
  en: { emails: enEmails },
  de: { emails: deEmails },
  es: { emails: esEmails },
  fr: { emails: frEmails },
  pt: { emails: ptEmails },
};

// Initialize i18next for server-side use
i18next.init({
  ...getOptions(),
  resources,
  lng: "en", // default language
  fallbackLng: "en",
  preload: ["en", "de", "es", "fr", "pt"], // preload all supported languages
});

export default i18next;
