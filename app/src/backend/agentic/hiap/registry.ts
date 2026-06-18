import { z } from "zod";

export const HIAP_LOAD_CONTEXT_CAPABILITY = "hiap.load_context" as const;
export const HIAP_UPDATE_SELECTION_CAPABILITY =
  "hiap.update_selection" as const;
export const HIAP_GENERATE_PLAN_CAPABILITY = "hiap.generate_plan" as const;
export const HIAP_READ_PLAN_CAPABILITY = "hiap.read_plan" as const;
export const HIAP_RERANK_ACTION_CAPABILITY = "hiap.rerank_action" as const;

export const hiapWorkflowStepSchema = z.enum(["review", "plan"]);
export const hiapActionTypeSchema = z.enum(["mitigation", "adaptation"]);

export type HiapWorkflowStep = z.infer<typeof hiapWorkflowStepSchema>;
export type HiapActionType = z.infer<typeof hiapActionTypeSchema>;

const recordSchema = z.record(z.string(), z.unknown());

export const hiapBaseInputSchema = z.object({
  user_id: z.string().uuid(),
  city_id: z.string().uuid(),
  inventory_id: z.string().uuid(),
  lng: z.string().min(1).default("en"),
});

export const loadHiapContextInputSchema = hiapBaseInputSchema.extend({
  action_type: hiapActionTypeSchema.optional(),
});

export const updateHiapSelectionInputSchema = hiapBaseInputSchema.extend({
  selected_action_ids: z.array(z.string().min(1)),
  action_type: hiapActionTypeSchema.default("mitigation"),
});

export const generateHiapPlanInputSchema = hiapBaseInputSchema.extend({
  action_id: z.string().min(1),
  action_type: hiapActionTypeSchema,
});

export const readHiapPlanInputSchema = hiapBaseInputSchema.extend({
  action_id: z.string().min(1),
});

export const rerankHiapActionInputSchema = hiapBaseInputSchema.extend({
  action_id: z.string().min(1),
  action_type: hiapActionTypeSchema,
  target_rank: z.number().int().positive(),
});

export const hiapContextOutputSchema = z
  .object({
    city: recordSchema,
    inventory: recordSchema,
    module_access: recordSchema,
    mitigation: recordSchema,
    adaptation: recordSchema,
    action_plans: z.array(recordSchema),
  })
  .passthrough();

export const hiapCapabilityRegistry = {
  [HIAP_LOAD_CONTEXT_CAPABILITY]: {
    id: HIAP_LOAD_CONTEXT_CAPABILITY,
    operationType: "query",
    workflowSteps: ["review", "plan"],
    requiresConfirmation: false,
    writesCommittedProductData: false,
  },
  [HIAP_UPDATE_SELECTION_CAPABILITY]: {
    id: HIAP_UPDATE_SELECTION_CAPABILITY,
    operationType: "command",
    workflowSteps: ["review"],
    requiresConfirmation: true,
    writesCommittedProductData: true,
  },
  [HIAP_GENERATE_PLAN_CAPABILITY]: {
    id: HIAP_GENERATE_PLAN_CAPABILITY,
    operationType: "workflow",
    workflowSteps: ["plan"],
    requiresConfirmation: true,
    writesCommittedProductData: true,
  },
  [HIAP_READ_PLAN_CAPABILITY]: {
    id: HIAP_READ_PLAN_CAPABILITY,
    operationType: "query",
    workflowSteps: ["review", "plan"],
    requiresConfirmation: false,
    writesCommittedProductData: false,
  },
  [HIAP_RERANK_ACTION_CAPABILITY]: {
    id: HIAP_RERANK_ACTION_CAPABILITY,
    operationType: "command",
    workflowSteps: ["review"],
    requiresConfirmation: true,
    writesCommittedProductData: true,
  },
} as const;

export function getHiapAllowedCapabilities(
  workflowStep: HiapWorkflowStep,
): string[] {
  return Object.values(hiapCapabilityRegistry)
    .filter((capability) =>
      (capability.workflowSteps as readonly HiapWorkflowStep[]).includes(
        workflowStep,
      ),
    )
    .map((capability) => capability.id);
}
