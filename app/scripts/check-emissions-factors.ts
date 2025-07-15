import { readFile } from 'node:fs/promises'
import fs from 'node:fs'
import { parse } from 'csv-parse';
import path from 'path';
import { fileURLToPath } from 'url';

// fileURLToPath converts import.meta.url (a file:// URL) into a filesystem path
const __filename = fileURLToPath(import.meta.url);
// dirname of that gives you the directory
const __dirname  = path.dirname(__filename);

const manualInputPath = path.join(__dirname, '..', 'src', 'util', 'form-schema', 'manual-input-hierarchy.json')

async function processCsv(filePath: string) {
  const data = await readFile(manualInputPath, 'utf8')
  const json = JSON.parse(data)
  const stream = fs.createReadStream(filePath);
  const parser = stream.pipe(parse({ columns: true, skip_empty_lines: true }));

  for await (const row of parser) {
    if (!(row.gpc_reference_number in json)) {
      console.log(`${row.id}: ${row.gpc_reference_number} not in manual input file`)
      continue
    }
    const subsectorScope = json[row.gpc_reference_number]
    const methodology = subsectorScope.methodologies.find((meth: any) => meth.id == row.methodology_name)
    if (!methodology) {
      console.log(`${row.id}: ${row.methodology_name} not found for ${row.gpc_reference_number}.`)
      continue
    }
    if (row.metadata) {
      const metadata = JSON.parse(row.metadata)
      for (const key of Object.keys(metadata)) {
        let found = false
        for (const activity of methodology.activities) {
          for (const extraField of activity["extra-fields"]) {
            if (extraField.id == key) {
              found = true
              if (extraField.options && !extraField.options.includes((metadata[key]))) {
                console.log(`${row.id}: metadata has key ${key} with value ${metadata[key]} not found in options.`)
              }
              break
            }
          }
        }
        if (!found) {
          console.log(`${row.id}: ${row.metadata} has key ${key} not found for ${row.methodology_name}.`)
        }
      }
    }
  }

  console.log('Done processing all rows');
}

const csvFilePath = process.argv[2]

processCsv(csvFilePath).catch(console.error);
