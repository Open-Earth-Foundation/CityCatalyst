/**
 * CC-1008: the extraction prompt lists the valid GPC references, and a row whose
 * reference is missing or not in the taxonomy is resolved from its sector and
 * sub-sector. A real Masterton run returned five agriculture rows with no reference,
 * so the approve step skipped them (635,774 tCO2e).
 * The LLM is mocked: these tests check our code around the model, not the model.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const complete = jest.fn<(args: unknown) => Promise<{ content: string }>>();

jest.unstable_mockModule("@/backend/llm", () => ({
  createLLMClient: () => ({ complete }),
  LLMError: class LLMError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  LLMErrorCode: { BAD_REQUEST: "BAD_REQUEST" },
}));

const { extractInventoryFromDocument } =
  await import("@/backend/InventoryExtractionService");

const AFOLU = "Agriculture Forestry And Other Land Use Afolu";
const LIVESTOCK = "Emissions From Livestock Within The City Boundary";
const AGGREGATE =
  "Emissions From Aggregate Sources And Non Co2 Emission Sources On Land Within The City Boundary";

const row = (
  subsector: string,
  category: string,
  totalCO2e: number,
  extra: Record<string, unknown> = {},
) => ({
  year: 2022,
  sector: AFOLU,
  subsector,
  category,
  totalCO2e,
  unit: "t",
  rowType: "line_item",
  scope: "1",
  gpcRefNo: null,
  source: "Table 11",
  ...extra,
});

const document = "Table 11 Agriculture emissions 488422 73102 49543 14665";

beforeEach(() => {
  complete.mockReset();
});

describe("GPC references in the extraction prompt", () => {
  it("lists every valid reference with its sub-sector and the AFOLU activities", async () => {
    complete.mockResolvedValue({ content: JSON.stringify({ rows: [] }) });

    await extractInventoryFromDocument(document, { targetYear: 2022 });

    const system = (
      complete.mock.calls[0][0] as {
        messages: { role: string; content: string }[];
      }
    ).messages.find((m) => m.role === "system")!.content;
    expect(system).toContain("GPC references (use only these for gpcRefNo)");
    expect(system).toContain(
      `- I.1.1: Stationary Energy > Residential Buildings, scope 1`,
    );
    expect(system).toContain(
      `- V.1: ${AFOLU} > ${LIVESTOCK}, scope 1 (enteric-fermentation`,
    );
    expect(system).toContain(
      `- V.3: ${AFOLU} > ${AGGREGATE}, scope 1 (biomass-burning`,
    );
    expect(system).toContain("Never invent a reference or a sub-sector name");
  });
});

describe("rows without a usable GPC reference", () => {
  it("resolves agriculture rows from sector and sub-sector when the model leaves the reference empty", async () => {
    complete.mockResolvedValue({
      content: JSON.stringify({
        rows: [
          row(LIVESTOCK, "Enteric Fermentation", 488422),
          row(LIVESTOCK, "Managed Manure", 10042),
          row(AGGREGATE, "Fertilisers on Land", 14665),
        ],
      }),
    });

    const { rows } = await extractInventoryFromDocument(document, {
      targetYear: 2022,
    });

    expect(rows.map((r) => r.gpcRefNo)).toEqual(["V.1", "V.1", "V.3"]);
  });

  it("drops a reference that is not in the taxonomy and resolves it from the sub-sector", async () => {
    complete.mockResolvedValue({
      content: JSON.stringify({
        rows: [
          row(LIVESTOCK, "Enteric Fermentation", 488422, { gpcRefNo: "V.9" }),
        ],
      }),
    });

    const { rows } = await extractInventoryFromDocument(document, {
      targetYear: 2022,
    });

    expect(rows[0].gpcRefNo).toBe("V.1");
  });

  it("keeps a row without a reference when its sub-sector matches nothing (the import will report it)", async () => {
    complete.mockResolvedValue({
      content: JSON.stringify({
        rows: [
          row(
            "Agriculture Forestry And Fishing Activities",
            "Enteric Fermentation",
            488422,
          ),
        ],
      }),
    });

    const { rows } = await extractInventoryFromDocument(document, {
      targetYear: 2022,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].gpcRefNo ?? null).toBeNull();
  });
});
