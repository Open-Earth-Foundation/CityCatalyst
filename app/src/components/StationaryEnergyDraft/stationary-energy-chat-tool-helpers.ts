import type { TFunction } from "i18next";
import {
  type ConfirmedBulkReviewChoicePayload,
  type ConfirmedRollbackReviewChoicePayload,
  isStationaryEnergyStartDraftToolResult,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-helpers";
import { type StationaryEnergyToolChoiceSummary } from "@/components/StationaryEnergyDraft/stationary-energy-chat-messages";
import {
  type DecisionOption,
  type DecisionReviewContext,
} from "@/components/StationaryEnergyDraft/flow";

export function isStationaryEnergyReviewToolResult(tool: unknown): tool is {
  ui_event: string;
  action?: string;
  message_key?: string | null;
  message_params?: unknown;
  draft_run_id?: string;
  selected_choices?: unknown[];
  blocked_choices?: unknown[];
} {
  return (
    typeof tool === "object" &&
    tool !== null &&
    (tool as { ui_event?: unknown }).ui_event ===
      "stationary_energy_review_state_changed"
  );
}

export function isStationaryEnergyInventoryConfirmationToolResult(
  tool: unknown,
): tool is {
  success: boolean;
  ui_event: string;
  message_key?: string | null;
  message_params?: unknown;
  error_code?: string | null;
} {
  return (
    typeof tool === "object" &&
    tool !== null &&
    (tool as { ui_event?: unknown }).ui_event ===
      "stationary_energy_inventory_save_confirmation_requested"
  );
}

export function isStationaryEnergyBulkReviewConfirmationToolResult(
  tool: unknown,
): tool is {
  ui_event: string;
  message_key?: string | null;
  message_params?: unknown;
  draft_run_id?: string;
  pending_choices?: unknown[];
  blocked_choices?: unknown[];
} {
  return (
    typeof tool === "object" &&
    tool !== null &&
    (tool as { ui_event?: unknown }).ui_event ===
      "stationary_energy_review_bulk_confirmation_requested"
  );
}

export function isStationaryEnergyStagedReviewUpdateConfirmationToolResult(
  tool: unknown,
): tool is {
  ui_event: string;
  message_key?: string | null;
  message_params?: unknown;
  draft_run_id?: string;
  pending_choices?: unknown[];
  blocked_choices?: unknown[];
} {
  if (typeof tool !== "object" || tool === null) {
    return false;
  }
  const uiEvent = (tool as { ui_event?: unknown }).ui_event;
  return (
    uiEvent === "stationary_energy_review_change_confirmation_requested" ||
    uiEvent === "stationary_energy_review_rollback_confirmation_requested"
  );
}

function normalizeToolChoiceSummary(
  choice: unknown,
): StationaryEnergyToolChoiceSummary {
  if (typeof choice !== "object" || choice === null) {
    return {};
  }
  const record = choice as Record<string, unknown>;
  return {
    proposal_id:
      typeof record.proposal_id === "string" ? record.proposal_id : null,
    target_id: typeof record.target_id === "string" ? record.target_id : null,
    candidate_id:
      typeof record.candidate_id === "string" ? record.candidate_id : null,
    selected_candidate_id:
      typeof record.selected_candidate_id === "string"
        ? record.selected_candidate_id
        : null,
    selected_source_id:
      typeof record.selected_source_id === "string"
        ? record.selected_source_id
        : null,
    target_label:
      typeof record.target_label === "string" ? record.target_label : null,
    source_label:
      typeof record.source_label === "string" ? record.source_label : null,
    source_short_label:
      typeof record.source_short_label === "string"
        ? record.source_short_label
        : null,
    source_meta:
      typeof record.source_meta === "string" ? record.source_meta : null,
    value: typeof record.value === "string" ? record.value : null,
    action: typeof record.action === "string" ? record.action : null,
    notation_key:
      typeof record.notation_key === "string" ? record.notation_key : null,
    unavailable_reason:
      typeof record.unavailable_reason === "string"
        ? record.unavailable_reason
        : null,
    unavailable_explanation:
      typeof record.unavailable_explanation === "string"
        ? record.unavailable_explanation
        : null,
    rationale: typeof record.rationale === "string" ? record.rationale : null,
    reason: typeof record.reason === "string" ? record.reason : null,
  };
}

function decisionOptionsForToolChoice(
  context: DecisionReviewContext,
): DecisionOption[] {
  return [
    ...(context.recommendedOption ? [context.recommendedOption] : []),
    ...context.alternativeOptions,
    context.leaveDraftOption,
  ];
}

function optionForToolChoice(
  choice: StationaryEnergyToolChoiceSummary,
  context: DecisionReviewContext,
): DecisionOption | null {
  if (choice.action === "leave_draft") {
    return context.leaveDraftOption;
  }

  const ids = new Set(
    [
      choice.selected_candidate_id,
      choice.candidate_id,
      choice.selected_source_id,
    ].filter((value): value is string => Boolean(value)),
  );
  const options = decisionOptionsForToolChoice(context);

  if (ids.size > 0) {
    const matched = options.find((option) => {
      const optionIds = [option.id, option.datasourceId].filter(
        (value): value is string => Boolean(value),
      );
      return optionIds.some((value) => ids.has(value));
    });
    if (matched) {
      return matched;
    }
  }

  if (choice.action === "accept" && context.recommendedOption) {
    return context.recommendedOption;
  }

  const sourceLabel = choice.source_label?.trim().toLowerCase();
  if (sourceLabel) {
    const matched = options.find((option) =>
      [option.label, option.shortLabel]
        .filter(Boolean)
        .some((value) => value.trim().toLowerCase() === sourceLabel),
    );
    if (matched) {
      return matched;
    }
  }

  return null;
}

function enrichToolChoiceSummary(
  choice: StationaryEnergyToolChoiceSummary,
  decisionReviewContext: DecisionReviewContext[],
): StationaryEnergyToolChoiceSummary {
  const context = decisionReviewContext.find(
    (candidate) => candidate.proposal_id === choice.proposal_id,
  );
  if (!context) {
    if (choice.action === "set_notation_key") {
      return {
        ...choice,
        source_short_label:
          choice.source_short_label ?? choice.notation_key ?? null,
        source_label:
          choice.source_label ??
          (choice.notation_key ? `Notation key ${choice.notation_key}` : null),
        source_meta: choice.source_meta ?? choice.unavailable_reason ?? null,
        value:
          choice.value ??
          choice.unavailable_explanation ??
          choice.reason ??
          null,
      };
    }
    return choice;
  }

  const option = optionForToolChoice(choice, context);
  const isLeaveDraft = option?.action === "leave_draft";
  if (choice.action === "set_notation_key") {
    return {
      ...choice,
      target_label: choice.target_label ?? context.label,
      source_label:
        choice.source_label ??
        (choice.notation_key ? `Notation key ${choice.notation_key}` : null),
      source_short_label:
        choice.source_short_label ?? choice.notation_key ?? null,
      source_meta: choice.source_meta ?? choice.unavailable_reason ?? null,
      value: choice.value ?? choice.unavailable_explanation ?? null,
    };
  }

  return {
    ...choice,
    target_label: choice.target_label ?? context.label,
    source_label: choice.source_label ?? option?.label ?? null,
    source_short_label:
      choice.source_short_label ??
      (isLeaveDraft
        ? (choice.source_label ?? option?.label ?? null)
        : (option?.shortLabel ?? null)),
    source_meta:
      choice.source_meta ?? (isLeaveDraft ? null : (option?.meta ?? null)),
    value: choice.value ?? (isLeaveDraft ? null : (option?.value ?? null)),
  };
}

function toolChoiceSignature(choice: unknown): Record<string, unknown> {
  if (typeof choice !== "object" || choice === null) {
    return {};
  }
  const record = choice as Record<string, unknown>;
  return {
    proposal_id: record.proposal_id,
    target_id: record.target_id,
    action: record.action,
    candidate_id: record.candidate_id,
    selected_source_id: record.selected_source_id,
    selected_candidate_id: record.selected_candidate_id,
    source_label: record.source_label,
    target_label: record.target_label,
    notation_key: record.notation_key,
    unavailable_reason: record.unavailable_reason,
    unavailable_explanation: record.unavailable_explanation,
    rationale: record.rationale,
    reason: record.reason,
  };
}

export function stationaryEnergyToolResultSignature(
  tool: unknown,
): string | null {
  if (
    !isStationaryEnergyStartDraftToolResult(tool) &&
    !isStationaryEnergyReviewToolResult(tool) &&
    !isStationaryEnergyInventoryConfirmationToolResult(tool) &&
    !isStationaryEnergyBulkReviewConfirmationToolResult(tool) &&
    !isStationaryEnergyStagedReviewUpdateConfirmationToolResult(tool)
  ) {
    return null;
  }

  const record = tool as Record<string, unknown>;
  return JSON.stringify({
    ui_event: record.ui_event,
    action: record.action,
    success: record.success,
    draft_run_id: record.draft_run_id,
    error_code: record.error_code,
    message_key: record.message_key,
    message_params: record.message_params,
    selected_choices: Array.isArray(record.selected_choices)
      ? record.selected_choices.map(toolChoiceSignature)
      : [],
    pending_choices: Array.isArray(record.pending_choices)
      ? record.pending_choices.map(toolChoiceSignature)
      : [],
    blocked_choices: Array.isArray(record.blocked_choices)
      ? record.blocked_choices.map(toolChoiceSignature)
      : [],
  });
}

export function confirmedBulkReviewChoicePayload(
  choices: StationaryEnergyToolChoiceSummary[],
): ConfirmedBulkReviewChoicePayload[] {
  return choices.reduce<ConfirmedBulkReviewChoicePayload[]>((acc, choice) => {
    const proposalId = choice.proposal_id ?? "";
    if (!proposalId) {
      return acc;
    }

    acc.push({
      proposal_id: proposalId,
      ...(choice.target_id ? { target_id: choice.target_id } : {}),
      ...(choice.selected_candidate_id || choice.candidate_id
        ? {
            candidate_id:
              choice.selected_candidate_id ?? choice.candidate_id ?? "",
          }
        : {}),
      ...(choice.selected_source_id
        ? { selected_source_id: choice.selected_source_id }
        : {}),
      ...(choice.action ? { action: choice.action } : {}),
      ...(choice.notation_key ? { notation_key: choice.notation_key } : {}),
      ...(choice.unavailable_reason
        ? { unavailable_reason: choice.unavailable_reason }
        : {}),
      ...(choice.unavailable_explanation
        ? { unavailable_explanation: choice.unavailable_explanation }
        : {}),
      ...(choice.rationale ? { rationale: choice.rationale } : {}),
    });
    return acc;
  }, []);
}

export function confirmedRollbackReviewChoicePayload(
  choices: StationaryEnergyToolChoiceSummary[],
): ConfirmedRollbackReviewChoicePayload[] {
  return choices.reduce<ConfirmedRollbackReviewChoicePayload[]>(
    (acc, choice) => {
      const proposalId = choice.proposal_id ?? "";
      if (proposalId) {
        acc.push({ proposal_id: proposalId });
      }
      return acc;
    },
    [],
  );
}

export function translateMessage(
  t: TFunction,
  message?: string | null,
): string {
  if (!message) {
    return "";
  }

  const translated = t(message);
  return translated === message ? message : translated;
}

export function resolveErrorMessage(
  t: TFunction,
  error: unknown,
  fallbackKey: string,
): string {
  const message = error instanceof Error ? error.message : null;
  return translateMessage(t, message) || t(fallbackKey);
}

export function summarizeToolChoices(
  choices: unknown[],
  decisionReviewContext: DecisionReviewContext[],
): StationaryEnergyToolChoiceSummary[] {
  return choices.map((choice) =>
    enrichToolChoiceSummary(
      normalizeToolChoiceSummary(choice),
      decisionReviewContext,
    ),
  );
}
