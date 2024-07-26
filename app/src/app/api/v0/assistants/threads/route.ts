import { apiHandler } from "@/util/api";
import { openai } from "@/util/openai";
import { NextResponse } from "next/server";

// TODO: Add t object to new message below.

export const POST = apiHandler(async () => {
  const thread = await openai.beta.threads.create();

  // Add an optional context message on the thread
  await openai.beta.threads.messages.create(thread.id, {
    role: "user",
    content: `
    ###### BEGINNING OF CONTEXT ######
    City: Achim
    Region: Niedersachsen
    Country: Germany
    ###### END OF CONTEXT ######
    `,
  });

  // Add custom initial message to newly created thread.
  await openai.beta.threads.messages.create(thread.id, {
    role: "assistant",
    content: "Hello! I am CLIMA",
  });

  return NextResponse.json({ threadId: thread.id });
});
