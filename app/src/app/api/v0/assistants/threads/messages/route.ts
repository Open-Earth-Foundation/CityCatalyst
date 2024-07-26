import { apiHandler } from "@/util/api";
import { openai } from "@/util/openai";
// import { NextResponse } from "next/server";
// import { AssistantStream } from "openai/lib/AssistantStream";
import { AssistantResponse } from "ai";

const assistantId = process.env.OPENAI_ASSISTANT_ID as string;

// const handleReadableStream = (stream: AssistantStream) => {
//   // Messages
//   stream.on("textCreated", () => console.log("Created"));
//   stream.on("textDelta", (delta) => console.log(delta.value));
// };

// Send a new message to a thread
export const POST = apiHandler(async (req) => {
  const input: {
    threadId: string;
    message: string;
  } = await req.json();

  const threadId = input.threadId;

  // Add a user message on the thread
  const createdMessage = await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content: input.message,
  });

  // Run the thread with streaming output
  const stream = openai.beta.threads.runs.stream(threadId, {
    assistant_id: assistantId,
  });

  // handleReadableStream(stream);

  return AssistantResponse(
    { threadId, messageId: createdMessage.id },
    async ({ forwardStream, sendDataMessage }) => {
      // forward run status would stream message deltas
      let runStream = await forwardStream(stream);
    },
  );
});
