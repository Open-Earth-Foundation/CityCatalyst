import { apiHandler } from "@/util/api";
import { setupOpenAI } from "@/util/openai";
import { NextResponse } from "next/server";

import { Roles } from "@/util/types";

// Create a new assistant
export const POST = apiHandler(async (_req, { session }) => {
  if (session?.user.role !== Roles.Admin) {
    return NextResponse.json({ error: "Method Not Allowed", status: 405 });
  } else {
    // API route not yet fully implemented. It gives the baseline for future automation
    // TODO: Add API route for creating a vector store
    // TODO: Add API route for uploading files to vector store.
    // TODO: This vector store needs to passed to this endpoint below.
    return NextResponse.json({ error: "Not Implemented", status: 501 });

    const openai = setupOpenAI();
    const userID = session?.user.id;

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
  }
});
