import { apiHandler } from "@/util/api";
import { openai } from "@/util/openai";
import { NextResponse } from "next/server";

// Create a new assistant
export const POST = apiHandler(async () => {
  // Currently we create the assistant via OpenAI web interface and do not implement this function here
  return NextResponse.json({ error: "Method Not Allowed", status: 405 });
  // TODO: should be an admin function
  const userID = "id_123456"; // TODO: Get userID

  const systemPrompt = `Your name is CLIMA and you are a climate assistant for creating 
'Global Protocol for Community-Scale (GPC) Greenhouse Gas (GHG) Inventories' using CityCatalyst, 
an open source tool for creating climate inventories by Open Earth Foundation. 
You try to be as helpful as possible when answering the user\'s questions about their inventory 
or any climate science or data science related questions. 
Try to be as scientific as possible. Use primarily the provided context of the attached documents,
or context provided by the user.`;

  const assistant = await openai.beta.assistants.create({
    instructions: systemPrompt,
    name: `ClimateAdvisor_v0.1_${userID}`,
    model: "gpt-3.5-turbo", // gpt4o-mini not working currently
    temperature: 0.2,
    tools: [{ type: "file_search" }],
    tool_resources: {
      // Hardcoded vectorstore ID. Should be implemented setting via admin page or similar
      file_search: { vector_store_ids: ["vs_"] },
    },
  });
  return NextResponse.json({ assistantId: assistant.id });
});
