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
import { Population } from "@/models/Population";

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

// Function below is not being referenced/implemented

// async function streamToString(stream: any) {
//   const reader = stream.getReader();
//   const textDecoder = new TextDecoder();
//   let result = "";

//   async function read() {
//     const { done, value } = await reader.read();

//     if (done) {
//       return result;
//     }

//     result += textDecoder.decode(value, { stream: true });
//     return read();
//   }

//   return read();
// }

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
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    stream: true,
    messages: messages as any as ChatCompletionMessageParam[],
  });
  const stream = OpenAIStream(response);
  return new StreamingTextResponse(stream);
}

/**
 * Creates a system message with context included
 */
function create_prompt_template(inventory: Inventory): string {
  /**
   * Helper function to extract the latest population value
   */
  function find_last_city_population(
    populations: Population[],
  ): [number | undefined, number | undefined] {
    let result: [number | undefined, number | undefined] = [
      undefined,
      undefined,
    ];

    // Loop through the array from back to front
    for (let i = populations.length - 1; i >= 0; i--) {
      // Check if the population field is populated
      if (populations[i].dataValues.population) {
        // Add the year and population to the results array
        result = [
          populations[i].dataValues.year,
          populations[i].dataValues.population,
        ];
        break;
      }
    }
    // Return either undefined or the latest known population
    return result;
  }

  /**
   * Helper function to extract the latest region population value
   */
  function find_last_region_population(
    populations: Population[],
  ): [number | undefined, number | undefined] {
    let result: [number | undefined, number | undefined] = [
      undefined,
      undefined,
    ];

    // Loop through the array from back to front
    for (let i = populations.length - 1; i >= 0; i--) {
      // Check if the population field is populated
      if (populations[i].dataValues.regionPopulation) {
        // Add the year and population to the results array
        result = [
          populations[i].dataValues.year,
          populations[i].dataValues.regionPopulation,
        ];
        break;
      }
    }
    // Return either undefined or the latest known population
    return result;
  }

  /**
   * Helper function to extract the latest country population value
   */
  function find_last_country_population(
    populations: Population[],
  ): [number | undefined, number | undefined] {
    let result: [number | undefined, number | undefined] = [
      undefined,
      undefined,
    ];

    // Loop through the array from back to front
    for (let i = populations.length - 1; i >= 0; i--) {
      // Check if the population field is populated
      if (populations[i].dataValues.countryPopulation) {
        // Add the year and population to the results array
        result = [
          populations[i].dataValues.year,
          populations[i].dataValues.countryPopulation,
        ];
        break;
      }
    }
    // Return either undefined or the latest known population
    return result;
  }

  const inventoryYear = inventory.dataValues.year;
  const cityName = inventory.city.dataValues.name;
  const regionName = inventory.city.dataValues.region;
  const countryName = inventory.city.dataValues.country;
  const countryLocode = inventory.city.dataValues.countryLocode;
  const cityArea = inventory.city.dataValues.area;

  const [cityPopulationYear, cityPopulation] = find_last_city_population(
    inventory.city.populations,
  );
  const [regionPopulationYear, regionPopulation] = find_last_region_population(
    inventory.city.populations,
  );
  const [countryPopulationYear, countryPopulation] =
    find_last_country_population(inventory.city.populations);

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
+ Population of the city for the year ${cityPopulationYear} (latest know value in the database): ${cityPopulation},
+ Population of the region for the year ${regionPopulationYear} (latest know value in the database): ${regionPopulation},
+ Population of the country for the year ${countryPopulationYear} (latest know value in the database): ${countryPopulation},
+ Area of the city in km\u00B2: ${cityArea},
+ Year for which the the inventory is being created: ${inventoryYear},
+ Current inventory values: .`;
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

  const prompt = create_prompt_template(inventory);

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
