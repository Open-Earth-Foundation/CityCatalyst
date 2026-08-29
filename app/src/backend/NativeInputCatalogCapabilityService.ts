import createHttpError from "http-errors";
import type { AppSession } from "@/lib/auth";
import { db } from "@/models";
import type { NativeInputCatalog } from "@/models/NativeInputCatalog";
import { PermissionService } from "@/backend/permissions/PermissionService";
import {
  getNativeInputCapabilityDefinition,
  projectNativeInputDiscoveryEntry,
  type NativeInputCapabilityDefinition,
  type NativeInputCapabilityId,
  type NativeInputDiscoveryCatalogEntry,
  type NativeInputDiscoveryEntry,
} from "@/backend/agentic/native-input-catalog/registry";
import {
  getNativeInputSourceAdapter,
  type NativeInputSourceAdapter,
} from "@/backend/agentic/native-input-catalog/source-adapters";

const DISCOVERY_RESULT_LIMIT = 100;
const AUTHORIZED_SCOPE_FIELDS = [
  "organizationId",
  "projectId",
  "cityId",
  "inventoryId",
] as const;

type CatalogScopeField = (typeof AUTHORIZED_SCOPE_FIELDS)[number];

export type NativeInputDiscoveryRequest = {
  userId?: string;
  organizationId?: string;
  projectId?: string;
  cityId?: string;
  inventoryId?: string;
  kind?: string;
  owningModule?: string;
  capabilityId?: NativeInputCapabilityId;
};

type CatalogEntry = NativeInputDiscoveryCatalogEntry & {
  availability?: NativeInputCatalog["availability"];
};

export interface NativeInputCapabilityServiceDependencies {
  findActiveCatalogEntries: () => Promise<CatalogEntry[]>;
  authorizeCatalogScope: (
    session: AppSession,
    request: NativeInputDiscoveryRequest,
    entry: CatalogEntry,
  ) => Promise<boolean>;
  getSourceAdapter: (entry: CatalogEntry) => NativeInputSourceAdapter | null;
  resolveCapability?: (
    entry: CatalogEntry,
  ) => NativeInputCapabilityDefinition | null;
}

const defaultDependencies: NativeInputCapabilityServiceDependencies = {
  async findActiveCatalogEntries() {
    const rows = await db.models.NativeInputCatalog.findAll({
      where: { availability: "active" },
      attributes: [
        "id",
        "kind",
        "owningModule",
        "sourceType",
        "sourceId",
        "userId",
        "inventoryId",
        "cityId",
        "projectId",
        "organizationId",
        "availability",
        "labels",
      ],
      order: [
        ["created", "ASC"],
        ["id", "ASC"],
      ],
      limit: DISCOVERY_RESULT_LIMIT,
    });
    return rows as unknown as CatalogEntry[];
  },
  authorizeCatalogScope: authorizeCatalogScope,
  getSourceAdapter: getNativeInputSourceAdapter,
};

function isSafePermissionMiss(error: unknown): boolean {
  return (
    createHttpError.isHttpError(error) && [403, 404].includes(error.statusCode)
  );
}

function requestMatchesEntry(
  request: NativeInputDiscoveryRequest,
  entry: CatalogEntry,
): boolean {
  if (request.userId && request.userId !== entry.userId) {
    return false;
  }

  return AUTHORIZED_SCOPE_FIELDS.every((field) => {
    const requestValue = request[field];
    const entryValue = entry[field];
    return !requestValue || !entryValue || requestValue === entryValue;
  });
}

async function checkPermission(
  session: AppSession,
  field: CatalogScopeField,
  value: string,
): Promise<boolean> {
  try {
    const options = { includeResource: false };
    switch (field) {
      case "organizationId":
        await PermissionService.canAccessOrganization(session, value, options);
        break;
      case "projectId":
        await PermissionService.canAccessProject(session, value, options);
        break;
      case "cityId":
        await PermissionService.canAccessCity(session, value, options);
        break;
      case "inventoryId":
        await PermissionService.canAccessInventory(session, value, options);
        break;
    }
    return true;
  } catch (error) {
    if (isSafePermissionMiss(error)) return false;
    throw error;
  }
}

/**
 * Check every populated catalog scope dimension without returning a
 * reason-bearing denial value to the discovery caller.
 */
export async function authorizeCatalogScope(
  session: AppSession,
  request: NativeInputDiscoveryRequest,
  entry: CatalogEntry,
): Promise<boolean> {
  if (!session.user?.id) return false;
  if (entry.userId && entry.userId !== session.user.id) return false;
  if (!requestMatchesEntry(request, entry)) return false;

  for (const field of AUTHORIZED_SCOPE_FIELDS) {
    const entryValue = entry[field];
    const requestValue = request[field];
    if (entryValue && !(await checkPermission(session, field, entryValue))) {
      return false;
    }
    if (
      requestValue &&
      !entryValue &&
      !(await checkPermission(session, field, requestValue))
    ) {
      return false;
    }
  }

  return true;
}

function matchesDiscoveryFilters(
  request: NativeInputDiscoveryRequest,
  entry: CatalogEntry,
  capabilityIds: readonly NativeInputCapabilityId[],
): boolean {
  return (
    (!request.kind || request.kind === entry.kind) &&
    (!request.owningModule || request.owningModule === entry.owningModule) &&
    (!request.capabilityId || capabilityIds.includes(request.capabilityId))
  );
}

export async function filterCatalogEntry(
  entry: CatalogEntry,
  request: NativeInputDiscoveryRequest,
  session: AppSession,
  dependencies: NativeInputCapabilityServiceDependencies = defaultDependencies,
): Promise<NativeInputDiscoveryEntry | null> {
  if (entry.availability && entry.availability !== "active") return null;

  const definition = (
    dependencies.resolveCapability ?? getNativeInputCapabilityDefinition
  )(entry);
  if (
    !definition ||
    !matchesDiscoveryFilters(request, entry, definition.capabilityIds)
  ) {
    return null;
  }

  const adapter = dependencies.getSourceAdapter(entry);
  if (!adapter) return null;

  try {
    if (!(await dependencies.authorizeCatalogScope(session, request, entry))) {
      return null;
    }
    if (!(await adapter.probeReadiness(entry))) return null;
  } catch {
    return null;
  }

  return projectNativeInputDiscoveryEntry(entry, definition.capabilityIds);
}

export async function discoverNativeInputs(
  request: NativeInputDiscoveryRequest,
  session: AppSession,
  dependencies: NativeInputCapabilityServiceDependencies = defaultDependencies,
): Promise<NativeInputDiscoveryEntry[]> {
  if (!session.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  if (request.userId && request.userId !== session.user.id) {
    throw new createHttpError.Forbidden(
      "Request user does not match authenticated service token",
    );
  }

  const entries = await dependencies.findActiveCatalogEntries();
  const discovered: NativeInputDiscoveryEntry[] = [];

  for (const entry of entries.slice(0, DISCOVERY_RESULT_LIMIT)) {
    const projected = await filterCatalogEntry(
      entry,
      request,
      session,
      dependencies,
    );
    if (projected) discovered.push(projected);
  }

  return discovered;
}
