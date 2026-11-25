import {
  IngestItemError,
  type IngestColumnMappingInput,
  type IngestColumnMappingProposal,
  type IngestColumnMappingState,
  type IngestConfirmedColumnMap,
} from "./types";

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "");
}

/** Shared mapper. Suggestions never commit. */
export function proposeColumnMap(
  input: IngestColumnMappingInput,
): IngestColumnMappingProposal {
  const taxonomy = new Set(input.taxonomyFields);
  const byNormalized = new Map(
    input.taxonomyFields.map((field) => [normalizeLabel(field), field]),
  );
  const requiredFields = input.requiredFields.filter((field) =>
    taxonomy.has(field),
  );

  const columns = input.sourceColumns.map((sourceColumn) => {
    const sampleValues = input.sampleValues[sourceColumn] ?? [];
    const suggested = input.suggested?.[sourceColumn] ?? null;
    if (suggested && taxonomy.has(suggested)) {
      return {
        sourceColumn,
        taxonomyField: suggested,
        sampleValues,
        suggestedBy: "model" as const,
      };
    }
    const heuristic = byNormalized.get(normalizeLabel(sourceColumn)) ?? null;
    return {
      sourceColumn,
      taxonomyField: heuristic,
      sampleValues,
      suggestedBy: heuristic ? ("heuristic" as const) : null,
    };
  });

  return {
    taxonomyFields: [...input.taxonomyFields],
    requiredFields,
    columns,
  };
}

export function confirmColumnMap(
  proposal: IngestColumnMappingProposal,
  mappings: IngestConfirmedColumnMap["mappings"],
): IngestConfirmedColumnMap {
  const allowedSources = new Set(
    proposal.columns.map((column) => column.sourceColumn),
  );
  const allowedFields = new Set(proposal.taxonomyFields);
  const bySource = new Map<string, string>();

  for (const mapping of mappings) {
    if (!allowedSources.has(mapping.sourceColumn)) {
      throw new IngestItemError(
        "mapping_incomplete",
        `Unknown source column ${mapping.sourceColumn}`,
      );
    }
    if (!mapping.taxonomyField || !allowedFields.has(mapping.taxonomyField)) {
      throw new IngestItemError(
        "mapping_incomplete",
        `Unknown taxonomy field ${mapping.taxonomyField}`,
      );
    }
    bySource.set(mapping.sourceColumn, mapping.taxonomyField);
  }

  for (const column of proposal.columns) {
    if (!bySource.has(column.sourceColumn)) {
      throw new IngestItemError(
        "mapping_incomplete",
        `Source column ${column.sourceColumn} is not mapped`,
      );
    }
  }

  const mappedFields = new Set(bySource.values());
  for (const field of proposal.requiredFields) {
    if (!mappedFields.has(field)) {
      throw new IngestItemError(
        "mapping_incomplete",
        `Required field ${field} is not mapped`,
      );
    }
  }

  return {
    mappings: proposal.columns.map((column) => ({
      sourceColumn: column.sourceColumn,
      taxonomyField: bySource.get(column.sourceColumn) as string,
    })),
  };
}

export function isColumnMappingPending(
  columnMapping: IngestColumnMappingState | null | undefined,
): boolean {
  return columnMapping?.status === "pending";
}
