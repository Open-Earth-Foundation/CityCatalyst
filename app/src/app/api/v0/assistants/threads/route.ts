// import OpenAI from "openai";
import { apiHandler } from "@/util/api";
import { openai } from "@/util/openai";

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

export const POST = apiHandler(async () => {
  const thread = await openai.beta.threads.create();
  //   {
  //   messages: [
  //     {
  //       role: "user", // ADD SYSTEM MESSAGE HERE?
  //       content:
  //         "How many shares of AAPL were outstanding at the end of of October 2023?",
  //       // Attach the new file to the message.
  //     },
  //   ],
  // });
  return Response.json({ threadId: thread.id });
});
