import { HfInference } from "@huggingface/inference";
import { z } from "zod";
import { HuggingFaceStream, OpenAIStream, StreamingTextResponse } from "ai";
import { experimental_buildOpenAssistantPrompt } from "ai/prompts";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { apiHandler } from "@/util/api";
<<<<<<< HEAD:app/src/app/api/v0/chat/route.ts
import { City } from "@/models/City";
import { CityUser } from "@/models/CityUser";
import { Inventory } from "@/models/Inventory";
=======
import UserService from "@/backend/UserService";
import { db } from "@/models";
>>>>>>> feature/implement-inventory-access-in-chatbot:app/src/app/api/v0/chat/[inventory]/route.ts

let Hf: HfInference, openai: OpenAI;

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

  console.log("Messages before:")
  console.log(messages)

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

  console.log("Messages before:")
  console.log(messages)

  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    stream: true,
    messages: messages as any as ChatCompletionMessageParam[],
  });
  const stream = OpenAIStream(response);
  return new StreamingTextResponse(stream);
}

<<<<<<< HEAD:app/src/app/api/v0/chat/route.ts
/**
 * Creates a system message with context included
 *  
 */
async function create_prompt_template(
  inventory: string
  // cityName: string,
  // regionName: string,
  // countryName: string,
  // cityPopulation: number, 
  // cityArea: number,
): Promise<string> {

  const cityID = "City";

  // const cityName = await fetch(`v0/city/${CityID}`);
  const cityName = "";
  const regionName = "";
  const countryName = "";
  const cityPopulation = "";
  const cityArea = "";

  return `You are a climate assistant for creating 
'Global Protocol for Community-Scale (GPC) Greenhouse Gas (GHG) Inventories' using CityCatalyst, 
an open source tool for creating climate inventories by Open Earth Foundation. 
You try to be as helpful as possible when answering the user\'s questions about their inventory 
or any climate science or data science related questions. 
Try to be as scientific as possible. Use the provided context below, to support the user.

CONTEXT 
+ Name of city name that the inventory is being created for: ${cityName},
+ Name of the corresponding region: ${regionName},
+ name of the corresponding country: ${countryName},
+ Population of the city: ${cityPopulation},
+ Area of the city in km\u00B2: ${cityArea},
+ Gross domestic product (GDP) of the city: ,
+ Year for which the the inventory is being created: ,
+ Current inventory values: .`;
}

export const POST = apiHandler(async (req: Request) => {
  
  const prompt = await create_prompt_template("1234-5678")
  console.log(prompt)
=======
export const POST = apiHandler(async (req, { params, session }) => {
  
  // FETCH INVENTORY DATA FROM DB
  
  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
    [
      {
        model: db.models.InventoryValue,
        as: "inventoryValues",
        include: [
          {
            model: db.models.GasValue,
            as: "gasValues",
            include: [
              { model: db.models.EmissionsFactor, as: "emissionsFactor" },
            ],
          },
          {
            model: db.models.DataSource,
            attributes: ["datasourceId", "sourceType"],
            as: "dataSource",
          },
        ],
      },
    ],
  );

  // Use this log to view actual data in the console
  console.log(inventory)

  // TODO: Create prompt function based on inventory data returned from query above
>>>>>>> feature/implement-inventory-access-in-chatbot:app/src/app/api/v0/chat/[inventory]/route.ts

  const { messages } = chatRequest.parse(await req.json());
  if (!messages[0].content.startsWith("You are a")) {
    messages.unshift({
      // The currently implemented HF model does not support system messages
      role: process.env.CHAT_PROVIDER == "huggingface" ? "user" : "system",
      content:
        prompt
        // 'You are a climate assistant for creating GPC climate inventories using CityCatalyst, an open source tool for creating climate inventories by Open Earth Foundation. You try to be as helpful as possible when answering the user\'s questions about their inventory or any climate science or data science related questions. Try to be as scientific as possible.',
    });
  }

  setupModels();
  if (process.env.CHAT_PROVIDER === "openai") {
    return handleOpenAIChat(messages);
  } else {
    return handleHuggingFaceChat(messages);
  }
});
