import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { randomUUID } from "node:crypto";

import { POST } from "@/app/api/v1/internal/ca/capabilities/hiap/inventory/context/route";
import GlobalAPIService from "@/backend/GlobalAPIService";
import { HIAP_INVENTORY_CONTEXT_CAPABILITY } from "@/backend/agentic/hiap/registry";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { AppSession, Auth } from "@/lib/auth";
import { db } from "@/models";
import {
  ACTION_TYPES,
  HighImpactActionRankingStatus,
  Roles,
} from "@/util/types";
import { expectStatusCode, mockRequest, setupTests } from "./helpers";

const cityId = "10000000-0000-4000-8000-000000000001";
const inventoryId = "20000000-0000-4000-8000-000000000001";
const mitigationRankingId = "30000000-0000-4000-8000-000000000001";
const adaptationRankingId = "30000000-0000-4000-8000-000000000002";
const serviceKey = "test-cc-service-key";
const serviceHeaders = {
  "X-Service-Name": "climate-advisor",
  "X-Service-Key": serviceKey,
};
const mockSession: AppSession = {
  user: { id: "test-user", role: Roles.Admin },
  expires: "1h",
};

describe("HIAP inventory internal CA context capability", () => {
  beforeEach(() => {
    setupTests();
    process.env.CC_SERVICE_API_KEY = serviceKey;
    process.env.NEXT_PUBLIC_FEATURE_FLAGS = "CA_SERVICE_INTEGRATION";
    jest.spyOn(Auth, "getServerSession").mockResolvedValue(mockSession);
    jest.spyOn(PermissionService, "canAccessInventory").mockResolvedValue({
      resource: { inventoryId, cityId },
    } as never);
    mockPersistedHiapReads();
    jest.spyOn(GlobalAPIService, "fetchAllClimateActions").mockResolvedValue([
      {
        ActionID: "city-added-action",
        ActionName: {
          en: "City-added action",
          es: "Acción añadida por la ciudad",
        },
        Description: {
          en: "An explicitly selected catalogue action.",
          es: "Una acción seleccionada explícitamente.",
        },
        Sector: ["Transportation"],
        PrimaryPurpose: ["Mitigation"],
        TimelineForImplementation: "<5 years",
        CostInvestmentNeeded: "low",
      },
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns selections and the full ranked fallback through read-only calls", async () => {
    const rankingCreate = jest.spyOn(
      db.models.HighImpactActionRanking,
      "create",
    );
    const actionCreate = jest.spyOn(db.models.HighImpactActionRanked, "create");
    const selectionCreate = jest.spyOn(
      db.models.UnrankedActionSelection,
      "create",
    );

    const response = await POST(capabilityRequest(cityId), {
      params: Promise.resolve({}),
    });

    await expectStatusCode(response, 200);
    const payload = await response.json();
    expect(payload.action).toBe(HIAP_INVENTORY_CONTEXT_CAPABILITY);
    expect(payload.success).toBe(true);
    expect(payload.data).toMatchObject({
      availability: "available",
      inventory_id: inventoryId,
      requested_language: "es",
      mitigation: {
        status: "available",
        ranking_id: mitigationRankingId,
        language: "en",
        selection_mode: "city_selected",
        counts: { ranked: 2, selected: 2, returned: 2 },
      },
      adaptation: {
        status: "available",
        ranking_id: adaptationRankingId,
        language: "en",
        selection_mode: "ranked_fallback",
        counts: { ranked: 4, selected: 0, returned: 4 },
      },
    });
    expect(
      payload.data.mitigation.actions.map(
        (action: { action_id: string }) => action.action_id,
      ),
    ).toEqual(["ranked-selected", "city-added-action"]);
    expect(payload.data.mitigation.actions[1]).toMatchObject({
      name: "Acción añadida por la ciudad",
      source: "unranked",
      selected: true,
      language: "es",
    });
    expect(
      payload.data.adaptation.actions.map(
        (action: { action_id: string }) => action.action_id,
      ),
    ).toEqual([
      "adaptation-one",
      "adaptation-two",
      "adaptation-three",
      "adaptation-four",
    ]);
    expect(GlobalAPIService.fetchAllClimateActions).toHaveBeenCalledTimes(1);
    expect(rankingCreate).not.toHaveBeenCalled();
    expect(actionCreate).not.toHaveBeenCalled();
    expect(selectionCreate).not.toHaveBeenCalled();
  });

  it("uses read permission and rejects an inventory/city mismatch", async () => {
    const accessSpy = jest.spyOn(PermissionService, "canAccessInventory");
    const response = await POST(capabilityRequest(randomUUID()), {
      params: Promise.resolve({}),
    });

    await expectStatusCode(response, 400);
    expect(accessSpy).toHaveBeenCalledWith(expect.anything(), inventoryId);
  });

  it("requires Climate Advisor service authentication", async () => {
    const response = await POST(
      mockRequest(
        {
          city_id: cityId,
          inventory_id: inventoryId,
          language: "en",
        },
        undefined,
        {},
      ),
      { params: Promise.resolve({}) },
    );

    await expectStatusCode(response, 401);
  });
});

function capabilityRequest(requestedCityId: string) {
  return mockRequest(
    {
      city_id: requestedCityId,
      inventory_id: inventoryId,
      language: "es",
    },
    undefined,
    serviceHeaders,
  );
}

function rankedAction(
  actionId: string,
  type: ACTION_TYPES,
  rank: number,
  selected: boolean,
  details: Record<string, unknown> = {},
) {
  const attributes = {
    id: randomUUID(),
    hiaRankingId:
      type === ACTION_TYPES.Mitigation
        ? mitigationRankingId
        : adaptationRankingId,
    actionId,
    rank,
    explanation: { explanations: { en: `${actionId} explanation` } },
    lang: "en",
    type,
    name: actionId,
    isSelected: selected,
    ...details,
  };
  return {
    ...attributes,
    toJSON: () => attributes,
  };
}

function mockPersistedHiapReads() {
  const mitigationRanking = {
    id: mitigationRankingId,
    status: HighImpactActionRankingStatus.SUCCESS,
    lastUpdated: new Date("2026-07-29T10:00:00Z"),
  };
  const adaptationRanking = {
    id: adaptationRankingId,
    status: HighImpactActionRankingStatus.SUCCESS,
    lastUpdated: new Date("2026-07-29T11:00:00Z"),
  };
  jest
    .spyOn(db.models.HighImpactActionRanking, "findOne")
    .mockImplementation(async (options: never) => {
      const where = (options as { where: { type: ACTION_TYPES } }).where;
      return (
        where.type === ACTION_TYPES.Mitigation
          ? mitigationRanking
          : adaptationRanking
      ) as never;
    });
  jest
    .spyOn(db.models.HighImpactActionRanked, "findAll")
    .mockImplementation(async (options: never) => {
      const where = (
        options as {
          where: { hiaRankingId: string };
        }
      ).where;
      if (where.hiaRankingId === mitigationRankingId) {
        return [
          rankedAction("ranked-selected", ACTION_TYPES.Mitigation, 1, true, {
            description: "Persisted ranked detail",
            sectors: ["Stationary Energy"],
            primaryPurposes: ["Mitigation"],
            costInvestmentNeeded: "medium",
            timelineForImplementation: "<5 years",
          }),
          rankedAction(
            "ranked-not-selected",
            ACTION_TYPES.Mitigation,
            2,
            false,
          ),
        ] as never;
      }
      return [
        rankedAction("adaptation-one", ACTION_TYPES.Adaptation, 1, false, {
          hazards: ["Floods"],
        }),
        rankedAction("adaptation-two", ACTION_TYPES.Adaptation, 2, false, {
          hazards: ["Heat"],
        }),
        rankedAction("adaptation-three", ACTION_TYPES.Adaptation, 3, false, {
          hazards: ["Drought"],
        }),
        rankedAction("adaptation-four", ACTION_TYPES.Adaptation, 4, false, {
          hazards: ["Wildfires"],
        }),
      ] as never;
    });
  jest
    .spyOn(db.models.UnrankedActionSelection, "findAll")
    .mockImplementation(async (options: never) => {
      const where = (options as { where: { actionType: ACTION_TYPES } }).where;
      return (
        where.actionType === ACTION_TYPES.Mitigation
          ? [
              {
                actionId: "city-added-action",
                lang: "en",
                isSelected: true,
              },
              {
                actionId: "city-added-action",
                lang: "es",
                isSelected: true,
              },
            ]
          : []
      ) as never;
    });
}
