import { apiHandler } from "@/util/api";
import { openai } from "@/util/openai";
import { AssistantStream } from "openai/lib/AssistantStream";
import { AssistantResponse } from "ai";

const assistantId = process.env.OPENAI_ASSISTANT_ID as string;

// Helper function for debugging
// Extracting tokens, looking into events, ...
const handleReadableStream = (stream: AssistantStream): AssistantStream => {
  // stream.on("textCreated", () => console.log("Created"));
  stream.on("textDelta", async (delta) => {
    // Make sure token has annotation value
    if (delta.annotations !== undefined && delta.annotations.length > 0) {
      // console.log(delta.value);
      // console.log(delta.annotations);
      // Token can have only one annotation
      const file_id = delta.annotations[0].file_citation.file_id;

      const citedFile = await openai.files.retrieve(file_id);
      // console.log(citedFile.filename);
    }
  });

  return stream;
};

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

  return AssistantResponse(
    { threadId, messageId: createdMessage.id },
    async ({ forwardStream, sendDataMessage }) => {
      let runStream = await forwardStream(handleReadableStream(stream));
    },
  );
});
