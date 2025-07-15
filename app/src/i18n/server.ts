import i18next from "i18next";
import { getOptions, languages, fallbackLng } from "./settings";
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
  lng: fallbackLng, // default language
  fallbackLng: fallbackLng,
  preload: languages, // preload all supported languages
});

export default i18next;
