import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

// Convert the module's URL to a file path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (!process.env.OPENAI_API_KEY) {
  console.error('Please set the OPENAI_API_KEY environment variable')
  process.exit(1)
}

const model = openai('gpt-4');

function stripQuotes(s) {
  return s.replace(/^"(.*)"$/, '$1')
}

async function translateString(sourceLanguage, targetLanguage, key, sourceValue) {
  const { text } = await generateText({
    model: model,
    system: `You are a climate tech translator concentrating on ${sourceLanguage}-${targetLanguage} translations. You return only the translated strings, no explanations or excuses. If you cannot translate the text, you return an empty string.`,
    prompt: `Translate the following text from ${sourceLanguage} to ${targetLanguage} for the key ${key}:\n\n"${sourceValue}"`,
  });
  return stripQuotes(text);
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

  const sourceDir = path.resolve(__dirname, `../src/i18n/locales/${sourceLanguage}`)
  const targetDir = path.resolve(__dirname, `../src/i18n/locales/${targetLanguage}`)

  if (!await pathExists(targetDir)) {
    console.log(`Directory ${targetDir} does not exist. Creating...`)
    await fs.mkdir(targetDir)
  }

  const files = (await fs.readdir(sourceDir))
  for (const file of files.sort()) {
    if (!file.endsWith('.json')) {
      continue
    }

    await synchFile(sourceLanguage, targetLanguage, file)
  }
}

async function synchFile(sourceLanguage, targetLanguage, fileName) {

  const sourceFile = path.resolve(__dirname, `../src/i18n/locales/${sourceLanguage}/${fileName}`)
  const targetFile = path.resolve(__dirname, `../src/i18n/locales/${targetLanguage}/${fileName}`)

  const sourceData = JSON.parse(await fs.readFile(sourceFile, 'utf8'))
  let targetData = {}

  if (!await pathExists(targetFile)) {
    console.log(`File ${targetFile} does not exist. Creating...`)
  } else {
    console.log(`File ${targetFile} exists. Parsing...`)
    targetData = JSON.parse(await fs.readFile(targetFile, 'utf8'))
  }

  for (const key in sourceData) {
    if (!(key in targetData)) {
      targetData[key] = await translateString(sourceLanguage, targetLanguage, key, sourceData[key])
    }
  }

  await fs.writeFile(targetFile, JSON.stringify(targetData, null, 2) + '\n')
}

if (process.argv.length < 3) {
  console.error('Usage: node update-translation.js <2-letter-language-code>')
  process.exit(1)
}

const languageCode = process.argv[2]

synchDirectory('en', languageCode)
  .then(() => {
    console.log('Done')
  })
  .catch((err) => {
    console.error(err)
  })
