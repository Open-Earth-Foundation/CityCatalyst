import { apiHandler } from "@/util/api";
import { openai } from "@/util/openai";
import { AssistantStream } from "openai/lib/AssistantStream";
import { AssistantResponse } from "ai";

const assistantId = process.env.OPENAI_ASSISTANT_ID as string;

// Helper function for debugging
const handleReadableStream = (stream: AssistantStream): AssistantStream => {
  stream.on("textCreated", () => console.log("Created"));
  stream.on("textDelta", async (delta) => {
    // Make sure token has annotation value
    if (delta.annotations !== undefined && delta.annotations.length > 0) {
      // console.log(delta.value);
      // console.log(delta.annotations);
      // @ts-ignore
      const file_id = delta.annotations[0].file_citation.file_id;

      const citedFile = await openai.files.retrieve(file_id);
      console.log(citedFile.filename);
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
      const run = await forwardStream(stream);

      // TODO: Implement visiualization on client side
      if (run?.required_action?.type === "submit_tool_outputs") {
        console.log("tool calls");

        const runId = run?.id;
        const toolCallId =
          run.required_action.submit_tool_outputs.tool_calls[0].id;

        // Get tool outputs - here mocked
        const toolOutputs = [
          {
            tool_call_id: toolCallId,
            output: "Mock ooutput",
          },
        ];

        // Submit result of tool outputs here
        const modifiedRun = await openai.beta.threads.runs.submitToolOutputs(
          threadId,
          runId,
          {
            tool_outputs: toolOutputs,
          },
        );
      }
    },
  );
});
