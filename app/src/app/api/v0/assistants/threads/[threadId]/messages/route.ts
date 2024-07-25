import { apiHandler } from "@/util/api";
import { openai } from "@/util/openai";
import { NextResponse } from "next/server";

const assistantId = process.env.OPENAI_ASSISTANT_ID as string;

// Send a new message to a thread
export const POST = apiHandler(async (req, { params: { threadId } }) => {
  const { content } = await req.json();

  await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content: content,
  });

  const stream = openai.beta.threads.runs
    .stream(threadId, {
      assistant_id: assistantId,
    })
    .on("textCreated", () => process.stdout.write("\nassistant > "))
    .on("textDelta", (textDelta) => {
      if (typeof textDelta.value === "string") {
        process.stdout.write(textDelta.value);
      }
    });

  return new NextResponse(stream.toReadableStream());
});
