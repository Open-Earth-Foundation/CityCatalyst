import { HfInference } from "@huggingface/inference";
import { z } from "zod";
import { HuggingFaceStream, OpenAIStream, StreamingTextResponse } from "ai";
import { experimental_buildOpenAssistantPrompt } from "ai/prompts";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const Hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runtime = "edge";

const roleSchema = z.enum([
  "function",
  "data",
  "system",
  "user",
  "assistant",
  "tool",
]);
const messagesSchema = z.array(
  z.object({ content: z.string(), role: roleSchema }),
);
const chatRequest = z.object({
  messages: messagesSchema,
});
type Messages = z.infer<typeof messagesSchema>;
type ChatRequest = z.infer<typeof chatRequest>;

async function handleHuggingFaceChat(
  messages: Messages,
): Promise<StreamingTextResponse> {
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

async function handleOpenAIChat(
  messages: Messages,
): Promise<StreamingTextResponse> {
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    stream: true,
    messages: messages as any as ChatCompletionMessageParam[],
  });
  const stream = OpenAIStream(response);
  return new StreamingTextResponse(stream);
}

export async function POST(req: Request) {
  const { messages } = chatRequest.parse(await req.json());

  if (process.env.CHAT_PROVIDER === "openai") {
    return handleOpenAIChat(messages);
  } else {
    return handleHuggingFaceChat(messages);
  }
}
