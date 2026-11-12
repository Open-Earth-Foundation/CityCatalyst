import { readFileSync } from "node:fs";
import type { Block } from "./report";

export type CaseManifestEntry = {
  id: string;
  city: string;
  country: string;
  year: number;
  block: Block;
  totalOnly: boolean;
  textTables: boolean | null;
  fileName: string;
  notes?: string;
};

export type SelectionInput = {
  cases?: string;
  set?: Block;
  eligible?: boolean;
};

export const MAX_FILES_PER_RUN = 10;

export class SelectionError extends Error {
  ids?: string[];
  constructor(message: string, ids?: string[]) {
    super(message);
    this.name = "SelectionError";
    this.ids = ids;
  }
}

export function loadManifest(path: string): CaseManifestEntry[] {
  return JSON.parse(readFileSync(path, "utf8")) as CaseManifestEntry[];
}

export function selectCases(
  manifest: CaseManifestEntry[],
  input: SelectionInput,
): CaseManifestEntry[] {
  const hasCases = input.cases !== undefined && input.cases.trim() !== "";
  if (hasCases && input.set) {
    throw new SelectionError("Use either --cases or --set, not both.");
  }
  if (!hasCases && !input.set) {
    throw new SelectionError("Provide --cases or --set.");
  }

  let selected: CaseManifestEntry[];
  if (hasCases) {
    // Ids are case-insensitive; a repeated id is one file.
    const wanted = [
      ...new Set(
        input
          .cases!.split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
      ),
    ];
    const byId = new Map(manifest.map((c) => [c.id.toUpperCase(), c]));
    const unknown = wanted.filter((id) => !byId.has(id));
    if (unknown.length) {
      throw new SelectionError(
        `Unknown case id(s): ${unknown.join(", ")}. Valid ids: ${manifest
          .map((c) => c.id)
          .join(", ")}`,
        unknown,
      );
    }
    selected = wanted.map((id) => byId.get(id)!);
  } else {
    selected = manifest.filter((c) => c.block === input.set);
  }

  if (input.eligible) {
    selected = selected.filter((c) => c.textTables === true && !c.totalOnly);
  }

  if (selected.length === 0) {
    throw new SelectionError(
      input.eligible
        ? "No case matches the selection: --eligible keeps only cases with textTables: true that are not total-only."
        : "No case matches the selection.",
    );
  }

  if (selected.length > MAX_FILES_PER_RUN) {
    throw new SelectionError(
      `${selected.length} files exceed the maximum of ${MAX_FILES_PER_RUN} per run: ${selected
        .map((c) => c.id)
        .join(", ")}`,
      selected.map((c) => c.id),
    );
  }
  return selected;
}
