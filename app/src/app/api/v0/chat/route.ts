import { HfInference } from "@huggingface/inference";
import { z } from "zod";
import { HuggingFaceStream, StreamingTextResponse } from "ai";
import { experimental_buildOpenAssistantPrompt } from "ai/prompts";

const Hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

export const runtime = "edge";

const roleSchema = z.enum([
  "function",
  "data",
  "system",
  "user",
  "assistant",
  "tool",
]);
const chatRequest = z.object({
  messages: z.array(z.object({ content: z.string(), role: roleSchema })),
});

export async function POST(req: Request) {
  const { messages } = chatRequest.parse(await req.json());

  const response = Hf.textGenerationStream({
    model: "OpenAssistant/oasst-sft-4-pythia-12b-epoch-3.5",
    inputs: experimental_buildOpenAssistantPrompt(messages),
    parameters: {
      max_new_tokens: 200,
      // @ts-ignore (valid param for OpenAssistant models)
      typical_p: 0.2,
      repetition_penalty: 1,
      truncate: 1000,
      return_full_text: false,
    },
  });

  const stream = HuggingFaceStream(response);
  return new StreamingTextResponse(stream);
}
