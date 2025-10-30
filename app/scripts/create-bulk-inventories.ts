import fs from "fs";
import { parseArgs } from 'node:util';

const DEFAULT_EMAILS = [
    "evan@openearth.org",
    "milan+test1@openearth.org",
    "milan+test@openearth.org",
    "amanda@openearth.org",
    "greta@openearth.org",
    "marina@openearth.org",
    "isaac.b@openearth.org",
    "maureen@openearth.org",
    "carlos@openearth.org",
  ];

const { values, positionals } = parseArgs({
  options: {
    token: {
      type: 'string',
      short: 't',
      default: process.env.CITY_CATALYST_API_TOKEN
    },
    origin: { type: 'string', short: 'o', default: 'https://citycatalyst.io' },
    projectId: { type: 'string', short: 'p' },
    emails: { type: 'string', short: 'e', default: DEFAULT_EMAILS.join(',') },
    years: { type: 'string', short: 'y' },
    scope: { type: 'string', short: 's', default: 'gpc_basic_plus' },
    gwp: { type: 'string', short: 'g', default: 'AR6' },
    skipCreate: { type: 'boolean', short: 'c', default: false },
    skipConnect: { type: 'boolean', short: 'n', default: false },
  },
  allowPositionals: true,
});

const apiToken = values.token;

if (!apiToken) {
  throw new Error(`No API token provided. Use --token option or set CITY_CATALYST_API_TOKEN environment variable.`);
}

const origin = values.origin;
const createUrl = `${origin}/api/v1/admin/bulk`;
const connectUrl = `${origin}/api/v1/admin/connect-sources`;
const chunkSize = 10;
const emails = values.emails?.split(',').map(email => email.trim());
const projectId = values.projectId;

if (!projectId) {
  throw new Error(`No project ID provided. Use --projectId option to specify the project.`);
}

const years = values.years?.split(',').map(year => parseInt(year.trim()));

if (!years || years.length === 0) {
  throw new Error(`No years provided. Use --years option to specify the years.`);
}

const scope = values.scope;
const gwp = values.gwp;

if (positionals.length === 0) {
  throw new Error(`No input file provided. Specify the path to the locodes file as a positional argument.`);
}

const baseCreateBody = {
  projectId,
  cityLocodes: [],
  emails,
  years,
  scope,
  gwp,
};

const baseConnectBody = {
  projectId,
  cityLocodes: [],
  userEmail: emails[0],
  years
};

function createRequest(body: any, method: string = "POST") {
  return fetch(createUrl, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(body),
  });
}

function connectRequest(body: any, method: string = "POST") {
  return fetch(connectUrl, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(body),
  });
}

async function createBulkInventories() {
  const cityLocodes = fs
    .readFileSync(positionals[0], "utf-8")
    .toString()
    .split("\n")
    .map((line) => line.trim());
  console.log(`Total locodes to process: ${cityLocodes.length}`);

  for (let i = 0; i < cityLocodes.length; i += chunkSize) {
    if (!values.skipCreate) {
      const result = await createRequest({
        ...baseCreateBody,
        cityLocodes: cityLocodes.slice(i, i + chunkSize),
      });
      if (!result.ok) {
        const errorText = await result.text();
        throw new Error(
          `Failed to create bulk inventories (index ${i} to ${i + chunkSize}): ${result.status} - ${errorText}`,
        );
      }
      console.log(
        `Created bulk inventories for locodes ${i} to ${i + chunkSize}`,
      );
    }

    if (!values.skipConnect) {
      const connectResult = await connectRequest({
        ...baseConnectBody,
        cityLocodes: cityLocodes.slice(i, i + chunkSize),
      });
      if (!connectResult.ok) {
        const errorText = await connectResult.text();
        throw new Error(
          `Failed to create bulk inventories (index ${i} to ${i + chunkSize}): ${connectResult.status} - ${errorText}`,
        );
      }
      console.log(
        `Connected bulk inventories for locodes ${i} to ${i + chunkSize}`,
      );
    }
  }
}

createBulkInventories().catch((error) => {
  console.error("Error creating bulk inventories:", error);
  process.exit(1);
});
