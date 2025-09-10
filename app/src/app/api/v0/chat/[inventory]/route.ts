/**
 * @swagger
 * /api/v0/chat/{inventory}:
 *   post:
 *     tags:
 *       - Chat
 *     summary: Stream chat completion for an inventory
 *     description: Generates a streamed chat response using either OpenAI or HuggingFace models with inventory context.
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [messages]
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [function, data, system, user, assistant, tool]
 *                     content:
 *                       type: string
 *     responses:
 *       200:
 *         description: Streamed chat response.
 *       401:
 *         description: Unauthorized or no access to inventory.
 *       404:
 *         description: Inventory not found.
 */
import { HfInference } from "@huggingface/inference";
import { z } from "zod";
import { HuggingFaceStream, OpenAIStream, StreamingTextResponse } from "ai";
import { experimental_buildOpenAssistantPrompt } from "ai/prompts";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { apiHandler } from "@/util/api";
import UserService from "@/backend/UserService";
import { db } from "@/models";
import { Inventory } from "@/models/Inventory";
import { PopulationEntry, findClosestYear } from "@/util/helpers";
import { PopulationAttributes } from "@/models/Population";

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

async function handleHuggingFaceChat(
  messages: Messages,
): Promise<StreamingTextResponse> {
  const response = Hf.textGenerationStream({
    // The chosen model below is performing much worse compared to GPT3.5
    // Should be exchanged with a more performant open model from HF that also supports system messages
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
  // Use type assertion to avoid TypeScript errors
  const model = process.env.OPEN_AI_MODEL as string;

  const response = await openai.chat.completions.create({
    model: model,
    stream: true,
    messages: messages as any as ChatCompletionMessageParam[],
  });
  const stream = OpenAIStream(response);
  return new StreamingTextResponse(stream);
}

/**
 * Creates a system message with context included
 */
function createPromptTemplate(inventory: Inventory): string {
  const inventoryYear = inventory.dataValues.year;

  const countryPopulations = inventory.city.populations.filter(
    (pop) => !!pop.countryPopulation,
  );
  const countryPopulationObj = findClosestYear(
    countryPopulations as PopulationEntry[],
    inventoryYear!,
  ) as PopulationAttributes;

  const countryPopulation = countryPopulationObj?.countryPopulation;
  const countryPopulationYear = countryPopulationObj?.year;

  const regionPopulations = inventory.city.populations.filter(
    (pop) => !!pop.regionPopulation,
  );
  const regionPopulationObj = findClosestYear(
    regionPopulations as PopulationEntry[],
    inventoryYear!,
  ) as PopulationAttributes;

  const regionPopulation = regionPopulationObj?.regionPopulation;
  const regionPopulationYear = regionPopulationObj?.year;

  const cityPopulations = inventory.city.populations.filter(
    (pop) => !!pop.population,
  );
  const cityPopulationObj = findClosestYear(
    cityPopulations as PopulationEntry[],
    inventoryYear!,
  ) as PopulationAttributes;

  const cityPopulation = cityPopulationObj?.population;
  const cityPopulationYear = cityPopulationObj?.year;

  const cityName = inventory.city.dataValues.name;
  const regionName = inventory.city.dataValues.region;
  const countryName = inventory.city.dataValues.country;
  const countryLocode = inventory.city.dataValues.countryLocode;
  const cityArea = inventory.city.dataValues.area;

  const numInventoryValues = inventory.inventoryValues?.length;

  return `You are a climate assistant for creating 
'Global Protocol for Community-Scale (GPC) Greenhouse Gas (GHG) Inventories' using CityCatalyst, 
an open source tool for creating climate inventories by Open Earth Foundation. 
You try to be as helpful as possible when answering the user\'s questions about their inventory 
or any climate science or data science related questions. 
Try to be as scientific as possible. Use primarily the provided context below, to support the user. 
If you need information that is not provided in the context below, use your own, internal knowledge.

CONTEXT 
+ Name of city name that the inventory is being created for: ${cityName},
+ Name of the corresponding region: ${regionName},
+ Name of the corresponding country: ${countryName},
+ UN/LOCODE of the corresponding country: ${countryLocode},
+ Population of the city ${cityName} for the year ${cityPopulationYear} (closest known value to the inventory year): ${cityPopulation},
+ Population of the region ${regionName} for the year ${regionPopulationYear} (closest known value to the inventory year): ${regionPopulation},
+ Population of the country ${countryName} for the year ${countryPopulationYear} (closest known value to the inventory year): ${countryPopulation},
+ Area of the city ${cityName} in km\u00B2: ${cityArea},
+ Year for which the the inventory is being created: ${inventoryYear},
+ Current number of inventory values for this city: ${numInventoryValues}.`;
}

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
      {
        model: db.models.City,
        as: "city",
        include: [
          {
            model: db.models.Population,
            as: "populations",
          },
        ],
      },
    ],
  );

  const prompt = createPromptTemplate(inventory);

  const { messages } = chatRequest.parse(await req.json());
  if (!messages[0].content.startsWith("You are a")) {
    messages.unshift({
      // The currently implemented HF model does not support system messages
      role: process.env.CHAT_PROVIDER == "huggingface" ? "user" : "system",
      content: prompt,
    });
  }

  setupModels();
  if (process.env.CHAT_PROVIDER === "openai") {
    return handleOpenAIChat(messages);
  } else {
    return handleHuggingFaceChat(messages);
  }
});
