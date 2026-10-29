import type { CoarseFileKind } from "../coarse-kind";
import type { IngestPlugin, IngestPluginContext } from "../plugin";
import { IngestItemError } from "../types";

/**
 * Fixture plugin. Accepts csv; never writes a module SoT.
 * MIME allowlisting is Core's job (CC-959).
 */
export class TestIngestPlugin implements IngestPlugin {
  readonly moduleId = "test" as const;
  readonly allowedExtensions = ["csv"] as const;

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
