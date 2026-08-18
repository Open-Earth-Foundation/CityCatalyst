/**
 * @swagger
 * /api/v1/internal/native-input-catalog/reconcile:
 *   post:
 *     operationId: reconcileNativeInputCatalog
 *     summary: Reconcile GHGI and legacy HIAP catalog registrations
 *     description: Authenticated internal endpoint. Dry-run is read-only; apply repairs only deterministic missing registrations.
 *     responses:
 *       200:
 *         description: Reconciliation report returned successfully.
 *       400:
 *         description: Invalid reconciliation request.
 *       401:
 *         description: Missing or invalid internal service credentials.
 *     tags:
 *       - native-input-catalog-internal
 */
import { NextResponse } from "next/server";

import { reconcileNativeInputCatalog } from "@/backend/NativeInputCatalogReconciliationService";
import { requireNativeInputCatalogServiceRequest } from "@/backend/NativeInputCatalogService";
import { apiHandler } from "@/util/api";
import { nativeInputCatalogReconciliationRequest } from "@/util/validation";

export const POST = apiHandler(async (req) => {
  requireNativeInputCatalogServiceRequest(req);
  const body = nativeInputCatalogReconciliationRequest.parse(await req.json());
  const report = await reconcileNativeInputCatalog(body);
  return NextResponse.json({ data: report });
});
