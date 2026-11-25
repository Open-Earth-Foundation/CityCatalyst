import type { CoarseFileKind } from "../coarse-kind";
import type { IngestPlugin, IngestPluginContext } from "../plugin";
import type { IngestSourceReconciliationInput } from "../source-reconciliation";
import { IngestItemError, type IngestModuleId } from "../types";

/**
 * Fixture plugin. Accepts csv; never writes a module SoT.
 * MIME allowlisting is Core's job (CC-959).
 */
export class TestIngestPlugin implements IngestPlugin {
  readonly moduleId: IngestModuleId;
  readonly allowedExtensions = ["csv"] as const;

  constructor(moduleId: IngestModuleId = "test") {
    this.moduleId = moduleId;
  }

  detect(_ctx: IngestPluginContext, coarse: CoarseFileKind): void {
    if (coarse !== "csv") {
      throw new IngestItemError(
        "unknown_format",
        `Test plugin has no format for ${coarse}`,
      );
    }
  }

  async parse(ctx: IngestPluginContext): Promise<string> {
    const buffer = ctx.item.buffer;
    if (!buffer || buffer.length === 0) {
      throw new IngestItemError("validation_failed", "Empty file");
    }
    return buffer.toString("utf8");
  }

  async adapt(
    _ctx: IngestPluginContext,
    parsed: unknown,
  ): Promise<{ text: string }> {
    return { text: String(parsed) };
  }

  async validate(
    _ctx: IngestPluginContext,
    adapted: unknown,
  ): Promise<{ warnings?: string[] }> {
    const text = (adapted as { text?: string }).text?.trim() ?? "";
    if (!text) {
      throw new IngestItemError("validation_failed", "File has no content");
    }
    return {};
  }

  approvalPolicy(): "auto" {
    return "auto";
  }

  serializeReviewDraft(adapted: unknown): unknown {
    return adapted;
  }

  hydrateReviewDraft(draft: unknown): unknown {
    return draft;
  }

  sourceReconciliation(
    ctx: IngestPluginContext,
    adapted: unknown,
  ): IngestSourceReconciliationInput {
    const text = (adapted as { text?: string }).text ?? "";
    return testPluginSourceReconciliation(ctx.item.originalFileName, text);
  }

  async commit(
    _ctx: IngestPluginContext,
    adapted: unknown,
  ): Promise<Record<string, unknown>> {
    const text = (adapted as { text: string }).text;
    return {
      committed: true,
      preview: text.split(/\r?\n/)[0] ?? "",
      lineCount: text.split(/\r?\n/).filter((line) => line.length > 0).length,
    };
  }
}

function splitCsv3(line: string): [string, string, string] {
  const first = line.indexOf(",");
  if (first < 0) return [line, "", ""];
  const second = line.indexOf(",", first + 1);
  if (second < 0) return [line.slice(0, first), line.slice(first + 1), ""];
  return [
    line.slice(0, first),
    line.slice(first + 1, second),
    line.slice(second + 1),
  ];
}

/** Fixture protocol. Header `kind,raw,reason` enables extra/missing/skip rows. */
export function testPluginSourceReconciliation(
  file: string,
  text: string,
): IngestSourceReconciliationInput {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const occupancy: IngestSourceReconciliationInput["occupancy"] = [];
  const proposed: IngestSourceReconciliationInput["proposed"] = [];
  const skipped: IngestSourceReconciliationInput["skipped"] = [];

  if (lines[0] === "kind,raw,reason") {
    lines.slice(1).forEach((line, index) => {
      const [kind, raw, reason] = splitCsv3(line);
      const pointer = { file, row: index + 1 };
      if (kind === "import") {
        occupancy.push({ pointer, raw });
        proposed.push({ pointer, raw });
      } else if (kind === "skip") {
        occupancy.push({ pointer, raw });
        skipped.push({ pointer, reason });
      } else if (kind === "source") {
        occupancy.push({ pointer, raw });
      } else if (kind === "extra") {
        proposed.push({ pointer, raw });
      }
    });
  } else {
    lines.forEach((raw, index) => {
      const pointer = { file, row: index + 1 };
      occupancy.push({ pointer, raw });
      proposed.push({ pointer, raw });
    });
  }

  return {
    sourceRowCount: occupancy.length,
    occupancy,
    proposed,
    skipped,
  };
}
