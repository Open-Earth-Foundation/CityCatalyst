import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const findPlan = jest.fn<(id: string) => Promise<unknown>>();
const findInventory = jest.fn<(id: string) => Promise<unknown>>();

jest.unstable_mockModule("@/models", () => ({
  db: {
    models: {
      ActionPlan: { findByPk: (id: string) => findPlan(id) },
      Inventory: { findByPk: (id: string) => findInventory(id) },
    },
  },
}));

import {
  HIAP_ACTION_PLAN_CONTEXT_CAPABILITY,
  HIAP_INVENTORY_CONTEXT_CAPABILITY,
} from "@/backend/agentic/hiap/registry";

let buildHiapActionPlanContext: typeof import("@/backend/agentic/hiap/plan-context").buildHiapActionPlanContext;
let parseActionPlanSourceId: typeof import("@/backend/agentic/hiap/plan-context").parseActionPlanSourceId;
let getNativeInputCapabilityDefinition: typeof import("@/backend/agentic/native-input-catalog/registry").getNativeInputCapabilityDefinition;
let getNativeInputSourceAdapter: typeof import("@/backend/agentic/native-input-catalog/source-adapters").getNativeInputSourceAdapter;

const planId = "40000000-0000-4000-8000-000000000001";
const planKey = {
  owningModule: "hiap",
  kind: "hiap_action_plan",
  sourceType: "action_plan",
};

beforeAll(async () => {
  ({ buildHiapActionPlanContext, parseActionPlanSourceId } =
    await import("@/backend/agentic/hiap/plan-context"));
  ({ getNativeInputCapabilityDefinition } =
    await import("@/backend/agentic/native-input-catalog/registry"));
  ({ getNativeInputSourceAdapter } =
    await import("@/backend/agentic/native-input-catalog/source-adapters"));
});

describe("HIAP action plan native input capability", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("lists the plan capability, not the ranking one, for plan rows", () => {
    expect(getNativeInputCapabilityDefinition(planKey)?.capabilityIds).toEqual([
      HIAP_ACTION_PLAN_CONTEXT_CAPABILITY,
    ]);
    expect(
      getNativeInputCapabilityDefinition({
        owningModule: "hiap",
        kind: "hiap_ranking",
        sourceType: "hiap_ranking",
      })?.capabilityIds,
    ).toEqual([HIAP_INVENTORY_CONTEXT_CAPABILITY]);
  });

  it("parses the plan id out of the digest-suffixed sourceId", () => {
    expect(parseActionPlanSourceId(`${planId}:abc123`)).toBe(planId);
    expect(parseActionPlanSourceId("not-a-uuid:abc")).toBeNull();
    expect(parseActionPlanSourceId("")).toBeNull();
  });

  it("returns a bounded plan summary through the adapter", async () => {
    findPlan.mockResolvedValue({
      id: planId,
      actionName: "Solar rooftops",
      language: "en",
      cityName: "Springfield",
      actionDescription: "Install panels",
      timeline: [{ phase: "1" }],
      costBudget: [{ item: "panels", cost: 10 }],
      milestones: [{ name: "tender" }],
      lastUpdated: new Date("2026-10-01T00:00:00Z"),
    });
    const adapter = getNativeInputSourceAdapter({
      id: "catalog-1",
      ...planKey,
    })!;

    const result = await adapter.executeSelected({
      entry: {
        id: "catalog-1",
        ...planKey,
        sourceId: `${planId}:abc123`,
        inventoryId: "20000000-0000-4000-8000-000000000001",
      },
      capabilityId: HIAP_ACTION_PLAN_CONTEXT_CAPABILITY,
      input: {
        city_id: "10000000-0000-4000-8000-000000000001",
        inventory_id: "20000000-0000-4000-8000-000000000001",
      },
    });

    expect(findPlan).toHaveBeenCalledWith(planId);
    expect(result).toMatchObject({
      status: "available",
      action_name: "Solar rooftops",
      timeline: [{ phase: "1" }],
      costBudget: [{ item: "panels", cost: 10 }],
      milestones: [{ name: "tender" }],
      truncated: false,
      omitted_sections: [],
    });
  });

  it("returns nothing for a missing plan or an unparsable sourceId", async () => {
    findPlan.mockResolvedValue(null);

    await expect(
      buildHiapActionPlanContext(`${planId}:abc`),
    ).resolves.toBeNull();
    await expect(buildHiapActionPlanContext("garbage")).resolves.toBeNull();
  });

  it("omits sections that would exceed the size bound and says so", async () => {
    findPlan.mockResolvedValue({
      id: planId,
      actionName: "Big plan",
      language: "en",
      timeline: [{ phase: "1" }],
      costBudget: [{ item: "x" }],
      milestones: [{ text: "m".repeat(50 * 1024) }],
      institutions: [{ name: "inst" }],
    });

    const result = await buildHiapActionPlanContext(`${planId}:abc`);

    expect(result).toMatchObject({
      truncated: true,
      omitted_sections: ["milestones"],
      institutions: [{ name: "inst" }],
    });
    expect(result).not.toHaveProperty("milestones");
  });
});
