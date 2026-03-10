import OpenAI from "openai";

const TARGET_LANGUAGES = ["es", "pt", "de", "fr"] as const;

const LANGUAGE_NAMES: Record<string, string> = {
  es: "Spanish",
  pt: "Portuguese",
  de: "German",
  fr: "French",
};

interface TranslatableFields {
  name: string;
  description?: string;
  tagline?: string;
}

interface TranslatedMaps {
  name: Record<string, string>;
  description: Record<string, string>;
  tagline: Record<string, string>;
}

async function translateText(
  openai: OpenAI,
  text: string,
  targetLanguage: string,
): Promise<string> {
  if (!text.trim()) return "";

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are a climate tech translator concentrating on English-${LANGUAGE_NAMES[targetLanguage]} translations. You return only the translated strings, no explanations or excuses. If you cannot translate the text, you return an empty string.`,
        },
        {
          role: "user",
          content: `Translate the following text from English to ${LANGUAGE_NAMES[targetLanguage]}:\n\n"${text}"`,
        },
      ],
    });

    const result = response.choices[0]?.message?.content || text;
    return result.replace(/^"(.*)"$/, "$1");
  } catch (error) {
    console.error(`Translation to ${targetLanguage} failed:`, error);
    return "";
  }
}

export async function translateModuleFields(
  fields: TranslatableFields,
): Promise<TranslatedMaps> {
  const nameMap: Record<string, string> = { en: fields.name };
  const descMap: Record<string, string> = {
    en: fields.description || "",
  };
  const taglineMap: Record<string, string> = {
    en: fields.tagline || "",
  };

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const translations = await Promise.all(
      TARGET_LANGUAGES.map(async (lang) => {
        const [name, description, tagline] = await Promise.all([
          fields.name ? translateText(openai, fields.name, lang) : "",
          fields.description
            ? translateText(openai, fields.description, lang)
            : "",
          fields.tagline ? translateText(openai, fields.tagline, lang) : "",
        ]);
        return { lang, name, description, tagline };
      }),
    );

    for (const t of translations) {
      if (t.name) nameMap[t.lang] = t.name;
      if (t.description) descMap[t.lang] = t.description;
      if (t.tagline) taglineMap[t.lang] = t.tagline;
    }
  } catch (error) {
    console.error("Module translation failed, saving English only:", error);
  }

  return { name: nameMap, description: descMap, tagline: taglineMap };
}
