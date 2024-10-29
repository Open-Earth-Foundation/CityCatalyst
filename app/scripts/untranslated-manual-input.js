import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Convert the module's URL to a file path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const manualInput = fs.readFileSync(path.resolve(__dirname, '../src/util/form-schema/manual-input-hierarchy.json'), 'utf8')
const manualInputData = JSON.parse(manualInput)
const translation = fs.readFileSync(path.resolve(__dirname, '../src/i18n/locales/en/data.json'), 'utf8')
const translationData = JSON.parse(translation)

const walk = (obj, check, acc) => {
  if (typeof obj === 'string') {
    if (check(obj)) {
      acc.push(obj)
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item) => {
      walk(item, check, acc)
    })
  } else if (typeof obj === 'object') {
    Object.keys(obj).forEach((key) => {
      walk(obj[key], check, acc)
    })
  }
};

const untranslated = []
walk(manualInputData, (str) => !(str in translationData), untranslated)

const keys = {}
for (const str of untranslated) {
  // Ignore activity IDs since we don't show them onscreen
  if (str.match(/-activity$/)) {
    continue
  }
  // Ignore these input types
  if (['number', 'text', 'percentage-breakdown'].includes(str)) {
    continue
  }
  keys[str] = ''
}

console.dir(keys)