import i18next, { createInstance } from "i18next";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";
import { getOptions } from "./settings";
import { getTranslationFromDictionary } from "@/util/helpers";

const initI18next = async (lng: string, ns: string) => {
  const i18nInstance = createInstance();
  await i18nInstance
    .use(initReactI18next)
    .use(
      resourcesToBackend(
        (language: string, namespace: string) =>
          import(`./locales/${language}/${namespace}.json`),
      ),
    )
    .init(getOptions(lng, ns));
  return i18nInstance;
};

export async function useTranslation(
  lng: string,
  ns: string,
  options: { keyPrefix?: string } = {},
) {
  const i18nextInstance = await initI18next(lng, ns);
  return {
    t: i18nextInstance.getFixedT(
      lng,
      Array.isArray(ns) ? ns[0] : ns,
      options.keyPrefix,
    ),
    i18n: i18nextInstance,
  };
}

export const getTranslationFromDict = (
  translations: Record<string, string> | string | undefined,
): string | undefined => {
  const lang = i18next.language;
  return getTranslationFromDictionary(translations, lang);
};
