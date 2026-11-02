import { GhgiIngestPlugin } from "./plugins/GhgiIngestPlugin";
import { TestIngestPlugin } from "./plugins/TestIngestPlugin";
import type { IngestPlugin } from "./plugin";
import type { IngestModuleId } from "./types";

/** Module plugin for confirm/hydrate. Wizard/bulk still use their own services. */
export function createIngestPlugin(moduleId: IngestModuleId): IngestPlugin {
  switch (moduleId) {
    case "ghgi":
      return new GhgiIngestPlugin();
    case "test":
      return new TestIngestPlugin();
    default:
      throw new Error(`No ingest plugin registered for module ${moduleId}`);
  }
}
