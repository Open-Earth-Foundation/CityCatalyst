import { apiHandler } from "@/util/api";
import { openai } from "@/util/openai";
import { NextResponse } from "next/server";
import { AssistantStream } from "openai/lib/AssistantStream";

const assistantId = process.env.OPENAI_ASSISTANT_ID as string;

const handleReadableStream = (stream: AssistantStream) => {
  // Messages
  stream.on("textCreated", () => console.log("Created"));
  stream.on("textDelta", (delta) => console.log(delta.value));

  // Events without helpers yet (e.g. requires_action and run.done)
  // stream.on("event", (event) => {
  //   if (event.event === "thread.run.requires_action") console.log(event);
  //   if (event.event === "thread.run.completed") console.log(event);
  // });
};

// Send a new message to a thread
export const POST = apiHandler(async (req, { params: { threadId } }) => {
  const { content } = await req.json();

  // Create a message on the thread
  await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content: `###### CONTEXT ######

  ###### END OF CONTEXT ######`,
  });

  await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content: content,
  });

  // Run the thread with streaming output
  const stream = openai.beta.threads.runs.stream(threadId, {
    assistant_id: assistantId,
  });

  handleReadableStream(stream);

  return new NextResponse(stream.toReadableStream());
});
