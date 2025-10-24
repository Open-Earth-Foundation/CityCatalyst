import fs from "fs";

const apiToken = "";
const apiUrl = "https://citycatalyst.openearth.dev/api/v1/admin/bulk";
const chunkSize = 50;

const baseRequestBody = {
  projectId: "f607b6d0-6ba1-4d54-b7de-e19dd7e2ff63",
  cityLocodes: [],
  emails: [
    "milan+test1@openearth.org",
    "milan+test@openearth.org",
    "amanda@openearth.org",
    "greta@openearth.org",
    "marina@openearth.org",
    "isaac.b@openearth.org",
    "maureen@openearth.org",
    "carlos@openearth.org",
  ],
  years: [2022],
  scope: "gpc_basic_plus",
  gwp: "AR6",
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

async function createBulkInventories() {
  const cityLocodes = fs.readFileSync("scripts/data/").toString().split("\n");
  console.log(`Total locodes to process: ${cityLocodes.length}`);

  for (let i = 0; i < cityLocodes.length; i += chunkSize) {
    const result = await makeRequest(apiUrl, {
      ...baseRequestBody,
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
}

createBulkInventories().catch((error) => {
  console.error("Error creating bulk inventories:", error);
  process.exit(1);
});
