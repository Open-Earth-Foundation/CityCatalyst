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
  // const stream = openai.beta.threads.runs.stream(threadId, {
  //   assistant_id: assistantId,
  // });

  // maybe create the run object first, do all the changes on the run object,
  // THEN call openai.beta.threads.runs.stream and pass back the streaming object?

  const run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: assistantId,
  });
  // console.log(run);

  let runStatus;
  do {
    //await new Promise((resolve) => setTimeout(resolve, 5000));
    const updatedRun = await openai.beta.threads.runs.retrieve(
      threadId,
      run.id,
    );
    runStatus = updatedRun.status;
    // console.log("updatedRun");
    // console.log(updatedRun);
    // console.log(updatedRun.status);

    if (
      runStatus === "requires_action" &&
      updatedRun.required_action?.type === "submit_tool_outputs"
    ) {
      const toolCallId =
        updatedRun.required_action?.submit_tool_outputs.tool_calls[0].id;
      //const toolOutputs = await handleToolCalls(updatedRun.required_action.submit_tool_outputs.tool_calls, sessionId);
      // Get tool outputs - here mocked
      const toolOutputs = [
        {
          tool_call_id: toolCallId,
          output: "SF6, SF8 gases, COmonter Gas and rabbits",
        },
      ];

      // Submit tool outputs to complete the run
      await openai.beta.threads.runs.submitToolOutputs(threadId, run.id, {
        tool_outputs: toolOutputs,
      });
      // re-fetch the run status after submitting tool outputs
      const recheckedRun = await openai.beta.threads.runs.retrieve(
        threadId,
        run.id,
      );
    }
  } while (runStatus !== "completed");

  // Run the thread with streaming output
  const stream = openai.beta.threads.runs.stream(threadId, {
    assistant_id: assistantId,
  });

  return AssistantResponse(
    { threadId, messageId: createdMessage.id },
    async ({ forwardStream, sendDataMessage }) => {
      const finishedRun = await forwardStream(stream);
    },
  );

  //return Response.json({});
  // return AssistantResponse(
  //   { threadId, messageId: createdMessage.id },
  //   async ({ forwardStream, sendDataMessage }) => {
  //     const run = await forwardStream(stream);

  //     // TODO: Implement visiualization on client side
  //     if (run?.required_action?.type === "submit_tool_outputs") {
  //       console.log("tool calls");

  //       const runId = run?.id;
  //       const toolCallId =
  //         run.required_action.submit_tool_outputs.tool_calls[0].id;

  //       // Get tool outputs - here mocked
  //       const toolOutputs = [
  //         {
  //           tool_call_id: toolCallId,
  //           output: "Mock ooutput",
  //         },
  //       ];

  //       // Submit result of tool outputs here
  //       const modifiedRun = await openai.beta.threads.runs.submitToolOutputs(
  //         threadId,
  //         runId,
  //         {
  //           tool_outputs: toolOutputs,
  //         },
  //       );
  //     }
  //   },
  // );
});
