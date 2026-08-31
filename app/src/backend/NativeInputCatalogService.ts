import createHttpError from "http-errors";
import { UniqueConstraintError, Op, Transaction } from "sequelize";
import type { NextRequest } from "next/server";

import { db } from "@/models";
import type { NativeInputCatalog } from "@/models/NativeInputCatalog";

export interface RegisterNativeInputInput {
  kind: string;
  owningModule: string;
  sourceType: string;
  sourceId: string;
  userId?: string | null;
  inventoryId?: string | null;
  cityId?: string | null;
  projectId?: string | null;
  organizationId?: string | null;
  contentDigest?: string | null;
  markdownReady?: boolean | null;
  labels?: Record<string, unknown> | null;
}

export type NativeInputCatalogScope = Pick<
  RegisterNativeInputInput,
  "userId" | "inventoryId" | "cityId" | "projectId" | "organizationId"
>;

export interface NativeInputCatalogRegistration {
  catalog: NativeInputCatalog;
  created: boolean;
}

function validateRegistrationInput(input: RegisterNativeInputInput): void {
  const requiredFields: Array<keyof RegisterNativeInputInput> = [
    "kind",
    "owningModule",
    "sourceType",
    "sourceId",
  ];
  for (const field of requiredFields) {
    if (!input[field] || !String(input[field]).trim()) {
      throw new createHttpError.BadRequest(`${field} is required`);
    }
  }

  const hasScope = Object.values({
    userId: input.userId,
    inventoryId: input.inventoryId,
    cityId: input.cityId,
    projectId: input.projectId,
    organizationId: input.organizationId,
  }).some(Boolean);
  if (!hasScope) {
    throw new createHttpError.BadRequest(
      "At least one scope identifier is required",
    );
  }
}

function toAttributes(input: RegisterNativeInputInput) {
  return {
    kind: input.kind,
    owningModule: input.owningModule,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    userId: input.userId ?? null,
    inventoryId: input.inventoryId ?? null,
    cityId: input.cityId ?? null,
    projectId: input.projectId ?? null,
    organizationId: input.organizationId ?? null,
    availability: "active" as const,
    contentDigest: input.contentDigest ?? null,
    markdownReady: input.markdownReady ?? null,
    labels: input.labels ?? null,
  };
}

async function findNonWithdrawnBySource(
  input: RegisterNativeInputInput,
  transaction?: Transaction,
): Promise<NativeInputCatalog | null> {
  return db.models.NativeInputCatalog.findOne({
    where: {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      availability: { [Op.ne]: "withdrawn" },
    },
    transaction,
  });
}

async function repairMissingContentDigest(
  catalog: NativeInputCatalog,
  input: RegisterNativeInputInput,
  transaction?: Transaction,
): Promise<void> {
  if (!catalog.contentDigest && input.contentDigest) {
    await catalog.update(
      { contentDigest: input.contentDigest },
      { transaction },
    );
  }
}

export async function registerNativeInput(
  input: RegisterNativeInputInput,
  transaction?: Transaction,
): Promise<NativeInputCatalogRegistration> {
  validateRegistrationInput(input);

  const existing = await findNonWithdrawnBySource(input, transaction);
  if (existing) {
    await repairMissingContentDigest(existing, input, transaction);
    return { catalog: existing, created: false };
  }

  try {
    const catalog = await db.models.NativeInputCatalog.create(
      toAttributes(input),
      {
        transaction,
      },
    );
    return { catalog, created: true };
  } catch (error) {
    // The partial unique index closes the race between concurrent registrations.
    if (!(error instanceof UniqueConstraintError)) throw error;
    const racedCatalog = await findNonWithdrawnBySource(input, transaction);
    if (!racedCatalog) throw error;
    await repairMissingContentDigest(racedCatalog, input, transaction);
    return { catalog: racedCatalog, created: false };
  }
}

export async function withdrawNativeInput(
  catalogId: string,
): Promise<NativeInputCatalog> {
  const catalog = await db.models.NativeInputCatalog.findByPk(catalogId);
  if (!catalog) {
    throw new createHttpError.NotFound("Native input catalog entry not found");
  }
  if (catalog.availability === "withdrawn") return catalog;

  await catalog.update({ availability: "withdrawn" });
  return catalog;
}

export async function supersedeNativeInput(
  catalogId: string,
  replacement: RegisterNativeInputInput,
): Promise<{
  previous: NativeInputCatalog;
  replacement: NativeInputCatalog;
}> {
  validateRegistrationInput(replacement);
  if (!db.sequelize) {
    throw new createHttpError.InternalServerError(
      "Database is not initialized",
    );
  }

  return db.sequelize.transaction(async (transaction) => {
    const current = await db.models.NativeInputCatalog.findByPk(catalogId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!current) {
      throw new createHttpError.NotFound(
        "Native input catalog entry not found",
      );
    }
    if (current.availability !== "active") {
      throw new createHttpError.Conflict(
        "Only an active catalog entry can be superseded",
      );
    }

    const registered = await registerNativeInput(replacement, transaction);
    if (registered.catalog.id === current.id) {
      throw new createHttpError.BadRequest(
        "Superseding an entry requires a new source identity",
      );
    }

    await current.update(
      {
        availability: "superseded",
        supersededById: registered.catalog.id,
      },
      { transaction },
    );
    return { previous: current, replacement: registered.catalog };
  });
}

export function requireNativeInputCatalogServiceRequest(
  req: NextRequest,
): void {
  const serviceName = req.headers.get("X-Service-Name");
  const serviceKey = req.headers.get("X-Service-Key");
  if (
    !serviceName ||
    !serviceKey ||
    serviceKey !== process.env.CC_SERVICE_API_KEY
  ) {
    throw new createHttpError.Unauthorized(
      "NativeInputCatalog service authentication required",
    );
  }
}
