import {
  processPdfOcrDeliveries,
  resolvePdfOcrDeliverySource,
} from "@/backend/PdfOcrDeliveryService";
import { processPdfOcrJobs } from "@/backend/PdfOcrService";
import { logger } from "@/services/logger";

let processing = false;
let rerunRequested = false;

async function runQueuedConceptNoteSourceProcessing(): Promise<void> {
  processing = true;
  try {
    do {
      rerunRequested = false;
      await processPdfOcrJobs();
      await processPdfOcrDeliveries(resolvePdfOcrDeliverySource);
    } while (rerunRequested);
  } catch (error) {
    logger.warn({ error }, "Concept Note source processing trigger failed");
  } finally {
    processing = false;
  }
}

export function triggerConceptNoteSourceProcessing(): void {
  if (processing) {
    rerunRequested = true;
    return;
  }

  void runQueuedConceptNoteSourceProcessing();
}
