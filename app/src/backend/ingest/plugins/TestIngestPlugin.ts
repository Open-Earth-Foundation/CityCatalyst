import type { IngestPlugin, IngestPluginContext } from "../plugin";
import { IngestItemError } from "../types";

/**
 * Fixture plugin for CC-989. Accepts .txt/.csv, never writes a module SoT.
 */
export class TestIngestPlugin implements IngestPlugin {
  readonly moduleId = "test" as const;
  readonly allowedExtensions = ["txt", "csv"] as const;

  detect(ctx: IngestPluginContext): void {
    const name = ctx.item.originalFileName.toLowerCase();
    const ok = this.allowedExtensions.some((ext) => name.endsWith(`.${ext}`));
    if (!ok) {
      throw new IngestItemError(
        "unknown_format",
        `Test plugin does not accept ${ctx.item.originalFileName}`,
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
