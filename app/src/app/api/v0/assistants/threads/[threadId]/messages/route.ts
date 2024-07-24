// import OpenAI from "openai";
import { apiHandler } from "@/util/api";
import { openai } from "@/util/openai";

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

const assistantId = process.env.OPENAI_ASSISTANT_ID as string;

// Send a new message to a thread
export const POST = apiHandler(async (req, { params: { threadId } }) => {
  const { content } = await req.json();

  await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content: content,
  });

  const stream = openai.beta.threads.runs.stream(threadId, {
    assistant_id: assistantId,
  });

  return new Response(stream.toReadableStream());
});
