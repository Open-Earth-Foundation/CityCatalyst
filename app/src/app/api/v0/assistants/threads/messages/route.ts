import { apiHandler } from "@/util/api";
import { setupOpenAI } from "@/util/openai";
// import { AssistantStream } from "openai/lib/AssistantStream";
import { NextResponse } from "next/server";

const assistantId = process.env.OPENAI_ASSISTANT_ID as string;

// Helper function for debugging
// const handleReadableStream = (stream: AssistantStream): AssistantStream => {
//   stream.on("textCreated", () => console.log("Created"));
//   stream.on("textDelta", async (delta) => {
//     // Make sure token has annotation value
//     if (delta.annotations !== undefined && delta.annotations.length > 0) {
//       // console.log(delta.value);
//       // console.log(delta.annotations);
//       // @ts-ignore
//       const file_id = delta.annotations[0].file_citation.file_id;

//       const citedFile = await openai.files.retrieve(file_id);
//       console.log(citedFile.filename);
//     }
//   });

//   return stream;
// };

// Send a new message to a thread
export const POST = apiHandler(async (req) => {
  const input: {
    threadId: string;
    content: string;
  } = await req.json();

  const openai = setupOpenAI();

  const threadId = input.threadId;

  // Add a user message on the thread
  const createdMessage = await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content: input.content,
  });

  // Run the thread with streaming output
  const stream = openai.beta.threads.runs.stream(threadId, {
    assistant_id: assistantId,
  });

  return new NextResponse(stream.toReadableStream());
});
