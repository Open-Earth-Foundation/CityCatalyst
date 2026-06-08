import { z } from "zod";

export const LOAD_CONTEXT_CAPABILITY =
  "ghgi.stationary_energy.load_context" as const;
export const COMMIT_ACCEPTED_CAPABILITY =
  "ghgi.stationary_energy.commit_accepted" as const;

export const stationaryEnergyWorkflowStepSchema = z.enum(["draft", "review"]);

export type StationaryEnergyWorkflowStep = z.infer<
  typeof stationaryEnergyWorkflowStepSchema
>;

export type StationaryEnergyCapabilityId =
  | typeof LOAD_CONTEXT_CAPABILITY
  | typeof COMMIT_ACCEPTED_CAPABILITY;

export type StationaryEnergyOperationType = "query" | "command" | "workflow";
export type StationaryEnergyResourceScope =
  | "user"
  | "city"
  | "inventory"
  | "sector"
  | "draft_run";
export type StationaryEnergyTransportExposure = "internal_ca_route";
export type StationaryEnergyResultShape =
  | "stationary_energy_context"
  | "stationary_energy_commit_results";

type StationaryEnergyConfirmationBehavior =
  | {
      required: false;
      type: "none";
    }
  | {
      required: true;
      type: "review_acceptance";
    };

export type StationaryEnergyCapabilityDefinition = {
  id: StationaryEnergyCapabilityId;
  module: "ghgi";
  sectorCode: "stationary_energy";
  operationType: StationaryEnergyOperationType;
  workflowSteps: readonly StationaryEnergyWorkflowStep[];
  requiredResourceScope: readonly StationaryEnergyResourceScope[];
  requiresConfirmation: boolean;
  writesCommittedProductData: boolean;
  confirmationBehavior: StationaryEnergyConfirmationBehavior;
  resultShape: StationaryEnergyResultShape;
  transportExposure: {
    type: StationaryEnergyTransportExposure;
    route: string;
  };
  schemas: {
    input: z.ZodTypeAny;
    output: z.ZodTypeAny;
  };
};

const recordSchema = z.record(z.string(), z.unknown());

export const allowedStationaryEnergyCapabilitiesInputSchema = z.object({
  user_id: z.string().uuid(),
  city_id: z.string().uuid(),
  inventory_id: z.string().uuid(),
  sector_code: z.literal("stationary_energy"),
  workflow_step: stationaryEnergyWorkflowStepSchema,
});

export const loadStationaryEnergyContextInputSchema = z.object({
  user_id: z.string().uuid(),
  city_id: z.string().uuid(),
  inventory_id: z.string().uuid(),
  sector_code: z.literal("stationary_energy").default("stationary_energy"),
  locale: z.string().min(1).optional(),
});

export const loadStationaryEnergyContextOutputSchema = z
  .object({
    city: recordSchema,
    inventory: recordSchema,
    taxonomy: z.array(recordSchema),
    current_values: z.array(recordSchema),
    source_candidates: z.array(recordSchema),
    permission_summary: recordSchema,
    guidance_context: recordSchema,
  })
  .passthrough();

const commitAcceptedStationaryEnergyBaseRowSchema = z.object({
  proposal_id: z.string().uuid(),
  decision_version: z.number().int().positive(),
  target_ref: recordSchema,
});

export const commitAcceptedStationaryEnergyRowSchema = z.discriminatedUnion(
  "row_type",
  [
    commitAcceptedStationaryEnergyBaseRowSchema.extend({
      row_type: z.literal("selected_source"),
      selected_source_id: z.string().uuid(),
    }),
    commitAcceptedStationaryEnergyBaseRowSchema.extend({
      row_type: z.literal("manual_override"),
      manual_value: z.number().positive(),
      manual_unit: z.string().min(1),
      note: z.string().optional(),
    }),
  ],
);

export const commitAcceptedStationaryEnergyInputSchema = z.object({
  draft_run_id: z.string().uuid(),
  user_id: z.string().uuid(),
  city_id: z.string().uuid(),
  inventory_id: z.string().uuid(),
  rows: z.array(commitAcceptedStationaryEnergyRowSchema).min(1),
});

export const commitAcceptedStationaryEnergyOutputSchema = z
  .object({
    draft_run_id: z.string().uuid(),
    inventory_id: z.string().uuid(),
    results: z.array(recordSchema),
  })
  .passthrough();

export const stationaryEnergyCapabilityRegistry = {
  [LOAD_CONTEXT_CAPABILITY]: {
    id: LOAD_CONTEXT_CAPABILITY,
    module: "ghgi",
    sectorCode: "stationary_energy",
    operationType: "query",
    workflowSteps: ["draft"],
    requiredResourceScope: ["user", "city", "inventory", "sector"],
    requiresConfirmation: false,
    writesCommittedProductData: false,
    confirmationBehavior: {
      required: false,
      type: "none",
    },
    resultShape: "stationary_energy_context",
    transportExposure: {
      type: "internal_ca_route",
      route:
        "/api/v1/internal/ca/capabilities/ghgi/stationary-energy/load-context",
    },
    schemas: {
      input: loadStationaryEnergyContextInputSchema,
      output: loadStationaryEnergyContextOutputSchema,
    },
  },
  [COMMIT_ACCEPTED_CAPABILITY]: {
    id: COMMIT_ACCEPTED_CAPABILITY,
    module: "ghgi",
    sectorCode: "stationary_energy",
    operationType: "command",
    workflowSteps: ["review"],
    requiredResourceScope: ["user", "city", "inventory", "sector", "draft_run"],
    requiresConfirmation: true,
    writesCommittedProductData: true,
    confirmationBehavior: {
      required: true,
      type: "review_acceptance",
    },
    resultShape: "stationary_energy_commit_results",
    transportExposure: {
      type: "internal_ca_route",
      route:
        "/api/v1/internal/ca/capabilities/ghgi/stationary-energy/commit-accepted",
    },
    schemas: {
      input: commitAcceptedStationaryEnergyInputSchema,
      output: commitAcceptedStationaryEnergyOutputSchema,
    },
  },
} satisfies Record<
  StationaryEnergyCapabilityId,
  StationaryEnergyCapabilityDefinition
>;

export function getStationaryEnergyCapabilityDefinition(
  capabilityId: StationaryEnergyCapabilityId,
): StationaryEnergyCapabilityDefinition {
  return stationaryEnergyCapabilityRegistry[capabilityId];
}

export function getStationaryEnergyAllowedCapabilityDefinitions(
  workflowStep: StationaryEnergyWorkflowStep,
): StationaryEnergyCapabilityDefinition[] {
  const capabilities = Object.values(
    stationaryEnergyCapabilityRegistry,
  ) as StationaryEnergyCapabilityDefinition[];

  return capabilities.filter((capability) =>
    capability.workflowSteps.includes(workflowStep),
  );
}

export function getStationaryEnergyAllowedCapabilities(
  workflowStep: StationaryEnergyWorkflowStep,
): string[] {
  return getStationaryEnergyAllowedCapabilityDefinitions(workflowStep).map(
    (capability) => capability.id,
  );
}
