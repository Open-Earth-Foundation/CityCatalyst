import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import OpenAI from "openai";
import { randomUUID } from "node:crypto";

const AI_MODEL = "gpt-4";
const NOTION_DATABASE_ID = "326eb557728b8083ac03de6394c9f7c5";

// Convert the module's URL to a file path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (!process.env.OPENAI_API_KEY) {
  console.error("Please set the OPENAI_API_KEY environment variable");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function stripQuotes(s) {
  return s.replace(/^"(.*)"$/, "$1");
}

async function translateString(
  sourceLanguage,
  targetLanguage,
  key,
  sourceValue,
) {
  const messages = [
    {
      role: "system",
      content: `You are a climate tech translator concentrating on ${sourceLanguage}-${targetLanguage} translations. You return only the translated strings, no explanations or excuses. If you cannot translate the text, you return an empty string.`,
    },
    {
      role: "user",
      content: `Translate the following text from ${sourceLanguage} to ${targetLanguage} for the key ${key}:\n\n"${sourceValue}"`,
    },
  ];
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    messages,
  });
  const tokensResponse = await openai.responses.input_tokens.count({
    model: AI_MODEL,
    input: messages,
  });
  const inputTokens = tokensResponse.input_tokens;

  return {
    result: stripQuotes(response.choices[0].message.content),
    inputTokens,
  };
}

async function pathExists(path) {
  try {
    await fs.access(path);
    return true; // If no error is thrown, the path exists
  } catch {
    return false; // If an error is thrown, the path does not exist
  }
}

async function synchDirectory(sourceLanguage, targetLanguage) {
  const sourceDir = path.resolve(
    __dirname,
    `../src/i18n/locales/${sourceLanguage}`,
  );
  const targetDir = path.resolve(
    __dirname,
    `../src/i18n/locales/${targetLanguage}`,
  );

  if (!(await pathExists(targetDir))) {
    console.log(`Directory ${targetDir} does not exist. Creating...`);
    await fs.mkdir(targetDir);
  }

  const files = await fs.readdir(sourceDir);
  for (const file of files.sort()) {
    if (!file.endsWith(".json")) {
      continue;
    }

    await synchFile(sourceLanguage, targetLanguage, file);
  }
}

async function synchFile(sourceLanguage, targetLanguage, fileName) {
  const sourceFile = path.resolve(
    __dirname,
    `../src/i18n/locales/${sourceLanguage}/${fileName}`,
  );
  const targetFile = path.resolve(
    __dirname,
    `../src/i18n/locales/${targetLanguage}/${fileName}`,
  );

  const sourceData = JSON.parse(await fs.readFile(sourceFile, "utf8"));
  let targetData = {};

  if (!(await pathExists(targetFile))) {
    console.log(`File ${targetFile} does not exist. Creating...`);
  } else {
    console.log(`File ${targetFile} exists. Parsing...`);
    targetData = JSON.parse(await fs.readFile(targetFile, "utf8"));
  }

  const stats = await synchData(
    sourceData,
    sourceLanguage,
    targetData,
    targetLanguage,
  );
  submitStats(stats);

  await fs.writeFile(targetFile, JSON.stringify(targetData, null, 2) + "\n");
}
async function synchData(
  sourceData,
  sourceLanguage,
  targetData,
  targetLanguage,
) {
  let totalInputTokens = 0;
  let totalQueries = 0;

  for (const key in sourceData) {
    if (typeof sourceData[key] === "string") {
      if (!(key in targetData) || typeof targetData[key] !== "string") {
        const result = await translateString(
          sourceLanguage,
          targetLanguage,
          key,
          sourceData[key],
        );
        targetData[key] = result.result;
        totalInputTokens += result.inputTokens;
        totalQueries += 1;
      }
    } else if (
      typeof sourceData[key] === "object" &&
      !Array.isArray(sourceData[key])
    ) {
      if (!(key in targetData) || typeof targetData[key] !== "object") {
        targetData[key] = {};
      }
      const { totalInputTokens: newInputTokens, totalQueries: newQueries } =
        await synchData(
          sourceData[key],
          sourceLanguage,
          targetData[key],
          targetLanguage,
        );
      totalInputTokens += newInputTokens;
      totalQueries += newQueries;
    }

    return { totalInputTokens, totalQueries };
  }
}

async function submitStats({ totalInputTokens, totalQueries }) {
  if (!process.env.NOTION_API_KEY) {
    console.error("Please set the OPENAI_API_KEY environment variable");
    return;
  }

  try {
    const response = await fetch("https://api.notion.com/v1/pages", {
      headers: {
        Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
        "Content-Type": "application/json",
        "Notion-Version": "2026-03-11",
      },
      body: {
        parent: {
          database_id: NOTION_DATABASE_ID,
        },
        properties: {
          id: {
            type: "text",
            text: randomUUID(),
          },
          queries: {
            type: "number",
            number: totalQueries,
          },
          input_tokens: {
            type: "number",
            number: totalInputTokens,
          },
          output_tokens: {
            type: "number",
            number: 0,
          },
          model: AI_MODEL,
          usage: "update-translations",
          timestamp: {
            type: "date",
            date: {
              start: new Date().toString(),
            },
          },
        },
      },
    });

    if (!response.ok) {
      console.error(
        "Failed to submit results to Notion, Status:",
        response.status,
      );
      const result = await response.json();
      console.error("Notion response:", result);
    }
  } catch (error) {
    console.error("Failed to submit results to Notion, error:", error.message);
  }
}

if (process.argv.length < 3) {
  console.error("Usage: node update-translation.js <2-letter-language-code>");
  process.exit(1);
}

const languageCode = process.argv[2];

synchDirectory("en", languageCode)
  .then(() => {
    console.log("Done");
  })
  .catch((err) => {
    console.error(err);
  });
