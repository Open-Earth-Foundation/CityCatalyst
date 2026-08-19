import createHttpError from "http-errors";
import { z } from "zod";

import { requireClimateAdvisorServiceRequest } from "@/backend/agentic/ghgi/stationary-energy/auth";
import {
  cloneConceptNotePdfOcrBindings,
  deleteConceptNotePdfOcrBindings,
  PdfSourceError,
} from "@/backend/PdfOcrService";
import { apiHandler } from "@/util/api";

const bodySchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("clone"),
    uploads: z
      .array(
        z.object({
          source_upload_id: z.string().uuid(),
          destination_upload_id: z.string().uuid(),
        }),
      )
      .max(100),
  }),
  z.object({
    operation: z.literal("delete"),
    upload_ids: z.array(z.string().uuid()).max(100),
  }),
]);

export const POST = apiHandler(async (req, { session }) => {
  requireClimateAdvisorServiceRequest(req);
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }

  const body = bodySchema.parse(await req.json());
  try {
    if (body.operation === "clone") {
      await cloneConceptNotePdfOcrBindings(
        body.uploads.map((upload) => ({
          sourceUploadId: upload.source_upload_id,
          destinationUploadId: upload.destination_upload_id,
        })),
      );
    } else {
      await deleteConceptNotePdfOcrBindings(body.upload_ids);
    }
  } catch (error) {
    if (error instanceof PdfSourceError) {
      throw new createHttpError.Conflict(error.message);
    }
    throw error;
  }

  return Response.json({});
});
