import { describe, expect, it } from "@jest/globals";
import type { LLMClient, LLMCompleteOptions, LLMConfig } from "@/backend/llm";
import type {
  CrvaDraftValue,
  CrvaFigure,
} from "@/backend/ingest/plugins/ccra/draft-schema";
import {
  judgeClientConfig,
  judgeField,
  VERDICT_DEFINITIONS,
} from "../scripts/crva-eval/judge";
import { VERDICTS, type GoldRow } from "../scripts/crva-eval/types";

const MODEL = "judge-model";

function gold(partial: Partial<GoldRow>): GoldRow {
  return {
    rowNumber: 2,
    fieldId: "A1.2a",
    itemKey: "Balay (1961)",
    goldValue: "Balay M. 1961, El Río de la Plata entre la atmósfera y el mar",
    pages: [179],
    evidence: "2 Balay M. 1961. El Río de la Plata entre la atmósfera y el mar",
    status: "FOUND",
    notes: "",
    trapNote: false,
    ...partial,
  };
}

function value(name: string, page = 179): CrvaDraftValue {
  return {
    fieldId: "A1.2a",
    value: { name, year: 1961 },
    source: { file: "ba.pdf", page, quote: `2 Balay M. 1961. ${name}` },
    origin: "ai_draft",
    confirmed: false,
  };
}

const GOLD_ROWS = [
  gold({}),
  gold({ rowNumber: 3, itemKey: "INDEC (2010)", status: "NOT_FOUND" }),
  gold({ rowNumber: 4, itemKey: "Skipped", status: "N/A" }),
  gold({ rowNumber: 5, fieldId: "B1.2a", itemKey: "Heat" }),
];

const FIGURES: CrvaFigure[] = [
  { page: 40, imageId: "img-1", caption: "Mapa de inundaciones" },
];

function judgment(overrides: Record<string, unknown>) {
  return {
    valueIndex: 0,
    itemKey: "Balay (1961)",
    verdict: "Correct",
    modelStatus: "FOUND",
    reason: "Same reference.",
    uncertain: false,
    goldGap: false,
    misattributedTo: null,
    ...overrides,
  };
}

/** Stub client that records each call and answers with the given judgments. */
function stubClient(judgments: unknown[], configuredModel = MODEL) {
  const calls: LLMCompleteOptions[] = [];
  const client = {
    complete: async (options: LLMCompleteOptions) => {
      calls.push(options);
      return {
        content: JSON.stringify({ judgments }),
        finishReason: "stop",
      };
    },
    getConfig: () => ({
      models: { crva_extraction: { name: configuredModel } },
    }),
  } as unknown as LLMClient;
  return { client, calls };
}

function run(client: LLMClient, values: CrvaDraftValue[]) {
  return judgeField({
    client,
    model: MODEL,
    fieldId: "A1.2a",
    goldRows: GOLD_ROWS,
    values,
    figures: FIGURES,
  });
}

describe("judgeField", () => {
  it("sends only non-N/A gold rows of the field and every value with page and quote", async () => {
    const { client, calls } = stubClient([
      judgment({}),
      judgment({ valueIndex: 1, itemKey: null, verdict: "Hallucination" }),
    ]);
    await run(client, [value("El Río de la Plata"), value("Otro libro", 12)]);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.use).toBe("crva_extraction");
    expect(call.jsonSchema?.name).toBeTruthy();
    const verdictSchema = (
      call.jsonSchema?.schema as {
        properties: {
          judgments: {
            items: { properties: { verdict: { enum: unknown[] } } };
          };
        };
      }
    ).properties.judgments.items.properties.verdict;
    expect(verdictSchema.enum).toEqual([...VERDICTS, null]);

    const system = call.messages[0].content;
    for (const definition of Object.values(VERDICT_DEFINITIONS)) {
      expect(system).toContain(definition);
    }
    const user = call.messages[1].content;
    expect(user).toContain("Balay (1961)");
    expect(user).toContain("INDEC (2010)");
    expect(user).not.toContain("Skipped");
    expect(user).not.toContain('"Heat"');
    expect(user).toContain("El Río de la Plata");
    expect(user).toContain("Otro libro");
    expect(user).toContain('"page":12');
    expect(user).toContain("2 Balay M. 1961. Otro libro");
    expect(user).toContain("Mapa de inundaciones");
  });

  it("keeps the model in the request record for audit", async () => {
    const { client } = stubClient([judgment({})]);
    const result = await run(client, [value("El Río de la Plata")]);
    expect(result.request).toMatchObject({ model: MODEL });
  });

  it("parses a match", async () => {
    const { client } = stubClient([judgment({})]);
    const result = await run(client, [value("El Río de la Plata")]);
    expect(result.judgments).toEqual([judgment({})]);
  });

  it("unknown item_key becomes unmatched and uncertain", async () => {
    const { client } = stubClient([judgment({ itemKey: "Nope" })]);
    const [result] = (await run(client, [value("El Río de la Plata")]))
      .judgments;
    expect(result.itemKey).toBeNull();
    expect(result.verdict).toBeNull();
    expect(result.uncertain).toBe(true);
    expect(result.reason).toContain("Nope");
  });

  it("missing value index is filled as unmatched and uncertain", async () => {
    const { client } = stubClient([judgment({})]);
    const { judgments } = await run(client, [
      value("El Río de la Plata"),
      value("Otro libro"),
    ]);
    expect(judgments).toHaveLength(2);
    expect(judgments[1]).toMatchObject({
      valueIndex: 1,
      itemKey: null,
      verdict: null,
      uncertain: true,
    });
  });

  it("verdict outside the list becomes null and uncertain", async () => {
    const { client } = stubClient([judgment({ verdict: "Mostly right" })]);
    const [result] = (await run(client, [value("El Río de la Plata")]))
      .judgments;
    expect(result.verdict).toBeNull();
    expect(result.uncertain).toBe(true);
    expect(result.reason).toContain("Mostly right");
  });

  it("row-level verdicts the scorer assigns are not accepted for a value", async () => {
    const { client } = stubClient([judgment({ verdict: "Omission" })]);
    const [result] = (await run(client, [value("El Río de la Plata")]))
      .judgments;
    expect(result.verdict).toBeNull();
    expect(result.uncertain).toBe(true);
  });

  it("misattribution keeps a known row and flags an unknown one", async () => {
    const misattributed = (to: string) =>
      judgment({
        itemKey: null,
        verdict: "Misattribution",
        misattributedTo: to,
      });
    const { client } = stubClient([
      misattributed("A1.2a/Balay (1961)"),
      { ...misattributed("A1.2a/Nope"), valueIndex: 1 },
      { ...misattributed("B1.2a/?"), valueIndex: 2 },
    ]);
    const { judgments } = await run(client, [
      value("a"),
      value("b"),
      value("c"),
    ]);
    expect(judgments[0]).toMatchObject({
      verdict: "Misattribution",
      misattributedTo: "A1.2a/Balay (1961)",
      uncertain: false,
    });
    expect(judgments[1].uncertain).toBe(true);
    expect(judgments[1].reason).toContain("A1.2a/Nope");
    expect(judgments[2].uncertain).toBe(false);
  });

  it("a gold gap has no row and no verdict", async () => {
    const { client } = stubClient([
      judgment({ goldGap: true, itemKey: "Balay (1961)", verdict: "Correct" }),
    ]);
    const [result] = (await run(client, [value("El Río de la Plata")]))
      .judgments;
    expect(result).toMatchObject({
      goldGap: true,
      itemKey: null,
      verdict: null,
    });
  });

  it("no call when the field has no model values", async () => {
    const { client, calls } = stubClient([]);
    const result = await run(client, []);
    expect(calls).toHaveLength(0);
    expect(result.judgments).toEqual([]);
  });

  it("throws when the client is configured for another model", async () => {
    const { client, calls } = stubClient([judgment({})], "gpt-5.6-luna");
    await expect(run(client, [value("El Río de la Plata")])).rejects.toThrow(
      `Judge client is configured for gpt-5.6-luna, expected ${MODEL}`,
    );
    expect(calls).toHaveLength(0);
  });

  it("throws when the answer was cut off at the token limit", async () => {
    const client = {
      complete: async () => ({
        content: '{"judgments": [',
        finishReason: "length",
      }),
      getConfig: () => ({ models: { crva_extraction: { name: MODEL } } }),
    } as unknown as LLMClient;
    await expect(run(client, [value("El Río de la Plata")])).rejects.toThrow(
      /token limit/,
    );
  });
});

describe("judgeClientConfig", () => {
  it("points the crva_extraction role at the judge model and keeps the rest", () => {
    const base = {
      provider: "openai",
      apiKey: "test",
      models: {
        pdf_extraction: { name: "a" },
        crva_extraction: { name: "b", reasoningEffort: "low" },
        file_interpretation: { name: "c", temperature: 0 },
      },
      timeoutMs: 1000,
      maxRetries: 1,
    } as LLMConfig;
    const config = judgeClientConfig(base, MODEL);
    expect(config.models.crva_extraction).toEqual({ name: MODEL });
    expect(config.models.pdf_extraction).toEqual({ name: "a" });
    expect(config.apiKey).toBe("test");
    expect(base.models.crva_extraction.name).toBe("b");
  });
});
