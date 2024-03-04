import { HfInference } from "@huggingface/inference";
import { z } from "zod";
import { HuggingFaceStream, OpenAIStream, StreamingTextResponse } from "ai";
import { experimental_buildOpenAssistantPrompt } from "ai/prompts";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { apiHandler } from "@/util/api";

let Hf, openai;

function setupModels() {
  if (!Hf) {
    Hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
  }
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
}

// export const runtime = "edge";

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

async function streamToString(stream: any) {
  const reader = stream.getReader();
  const textDecoder = new TextDecoder();
  let result = "";

  async function read() {
    const { done, value } = await reader.read();

    if (done) {
      return result;
    }

    result += textDecoder.decode(value, { stream: true });
    return read();
  }

  return read();
}

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

export const POST = apiHandler(async (req: Request) => {
  const { messages } = chatRequest.parse(await req.json());
  if (!messages[0].content.startsWith("You are a")) {
    messages.unshift({
      role: process.env.CHAT_PROVIDER == "huggingface" ? "user" : "system",
      content:
        'You are a climate assistant for creating GPC climate inventories using CityCatalyst, an open source tool for creating climate inventories by Open Earth Foundation. You try to be as helpful as possible when answering the user\'s questions about their inventory or any climate science or data science related questions. Try to be as scientific as possible.',
    });
  }

  setupModels();
  if (process.env.CHAT_PROVIDER === "openai") {
    return handleOpenAIChat(messages);
  } else {
    return handleHuggingFaceChat(messages);
  }
});
