import OpenAI from "openai";
import { apiHandler } from "@/util/api";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Create a new assistant
export const POST = apiHandler(async () => {
  const assistant = await openai.beta.assistants.create({
    instructions: "You are a helpful assistant.",
    name: "Quickstart Assistant",
    model: "gpt-4o-mini", // gpt4o-mini not working currently
    tools: [
      {
        type: "code_interpreter",
      },
    ],
  });
  return Response.json({ assistantId: assistant.id });
});
