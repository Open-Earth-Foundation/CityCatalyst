import fs from "fs";

const apiToken = process.env.CITY_CATALYST_API_TOKEN;
console.log("Token", apiToken);
if (!apiToken) {
  console.error("Error: CITY_CATALYST_API_TOKEN is not set in environment.");
  console.error(
    "Run with: CITY_CATALYST_API_TOKEN=your_token_here npm run bulk:connect-inventories",
  );
  process.exit(1);
}

const origin = "https://citycatalyst.openearth.dev";
// const origin = "http://localhost:3000";
const apiUrl = `${origin}/api/v1/admin/connect-sources`;
const chunkSize = 50;

const DEFAULT_EMAIL = "greta@openearth.org";

const EMAIL = DEFAULT_EMAIL;
// const EMAIL = "evan@openearth.org";

const DEFAULT_PROJECT_ID = "6169d5a4-0f31-4132-966e-c2feed1b9496";
const PROJECT_ID = DEFAULT_PROJECT_ID;
// const PROJECT_ID = "c6592782-ea7d-4231-87f2-39ba8d941ce0";

const baseRequestBody = {
  projectId: PROJECT_ID,
  cityLocodes: [],
  userEmail: EMAIL,
  years: [2022]
};

function makeRequest(url: string, body: any, method: string = "POST") {
  return fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(body),
  });
}

async function connectBulkInventories() {
  const cityLocodes = fs
    .readFileSync("scripts/data/brazil_locodes.csv")
    .toString()
    .split("\n")
    .map((line) => line.trim());
  console.log(`Total locodes to process: ${cityLocodes.length}`);

  for (let i = 0; i < cityLocodes.length; i += chunkSize) {
    const result = await makeRequest(apiUrl, {
      ...baseRequestBody,
      cityLocodes: cityLocodes.slice(i, i + chunkSize),
    });
    if (!result.ok) {
      const errorText = await result.text();
      throw new Error(
        `Failed to connect bulk inventories (index ${i} to ${i + chunkSize}): ${result.status} - ${errorText}`,
      );
    }
    console.log(
      `connected bulk inventories for locodes ${i} to ${i + chunkSize}`,
    );
  }
}

connectBulkInventories().catch((error) => {
  console.error("Error creating bulk inventories:", error);
  process.exit(1);
});
