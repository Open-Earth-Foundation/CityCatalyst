// import OpenAI from "openai";
import { apiHandler } from "@/util/api";
import { openai } from "@/util/openai";

// import UserService from "@/backend/UserService";
// import { db } from "@/models";
// import { Inventory } from "@/models/Inventory";
// import { PopulationEntry, findClosestYear } from "@/util/helpers";
// import { PopulationAttributes } from "@/models/Population";

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

/**
 * Creates a system message with context included
 */
function createPromptTemplate(
  cityName: string,
  regionName: string,
  countryName: string,
): string {
  return `You are a climate assistant for creating 
'Global Protocol for Community-Scale (GPC) Greenhouse Gas (GHG) Inventories' using CityCatalyst, 
an open source tool for creating climate inventories by Open Earth Foundation. 
You try to be as helpful as possible when answering the user\'s questions about their inventory 
or any climate science or data science related questions. 
Try to be as scientific as possible. Use primarily the provided context below, to support the user. 
If you need information that is not provided in the context below or in the attached documents, 
use your own, internal knowledge.

CONTEXT 
+ Name of city name that the inventory is being created for: ${cityName},
+ Name of the corresponding region: ${regionName},
+ Name of the corresponding country: ${countryName},`;
} // TODO: Currently testing via Postman without access to inventory data.

// Create a new assistant
export const POST = apiHandler(async (req, { params, session }) => {
  // TODO: fix mock values, (only used because of Postman)
  const prompt = createPromptTemplate("Achim", "Niedersachsen", "Germany");

  const userID = "id_123456"; // TODO: Get userID

  const assistant = await openai.beta.assistants.create({
    instructions: prompt,
    name: `ClimateAdvisor_v0.1_${userID}`,
    model: "gpt-3.5-turbo", // gpt4o-mini not working currently
    temperature: 0.2,
    tools: [{ type: "file_search" }],
    tool_resources: {
      file_search: { vector_store_ids: ["vs_oS3uJ02f4enB7oK5pSU8pIHq"] }, // TODO: Hardcoded vectorstore ID
    },
  });
  return Response.json({ assistantId: assistant.id });
  return Response.json({ error: "Method Not Allowed", status: 405 });
});
