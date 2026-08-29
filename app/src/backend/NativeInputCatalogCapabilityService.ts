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

export type NativeInputSelectedReadRequest = NativeInputDiscoveryRequest & {
  catalogId: string;
  capabilityId: NativeInputCapabilityId;
  input: unknown;
};

export type NativeInputCapabilityResponse = {
  action: NativeInputCapabilityId;
  success: true;
  data: Record<string, unknown>;
};

export const NATIVE_INPUT_CAPABILITY_UNAVAILABLE_CODE =
  "capability_unavailable" as const;
export const NATIVE_INPUT_CAPABILITY_UNAVAILABLE_MESSAGE =
  "Requested capability is unavailable." as const;

type CatalogEntry = NativeInputDiscoveryCatalogEntry & {
  availability?: NativeInputCatalog["availability"];
};

export interface NativeInputCapabilityServiceDependencies {
  findActiveCatalogEntries: () => Promise<CatalogEntry[]>;
  findCatalogEntryById?: (catalogId: string) => Promise<CatalogEntry | null>;
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
  async findCatalogEntryById(catalogId) {
    const row = await db.models.NativeInputCatalog.findByPk(catalogId, {
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
    });
    return row as unknown as CatalogEntry | null;
  },
  authorizeCatalogScope: authorizeCatalogScope,
  getSourceAdapter: getNativeInputSourceAdapter,
};

export function nativeInputCapabilityUnavailable(): createHttpError.HttpError {
  const error = new createHttpError.NotFound(
    NATIVE_INPUT_CAPABILITY_UNAVAILABLE_MESSAGE,
  ) as createHttpError.HttpError & { code?: string };
  error.code = NATIVE_INPUT_CAPABILITY_UNAVAILABLE_CODE;
  return error;
}

function isNativeInputCapabilityUnavailable(error: unknown): boolean {
  return (
    createHttpError.isHttpError(error) &&
    (error as createHttpError.HttpError & { code?: string }).code ===
      NATIVE_INPUT_CAPABILITY_UNAVAILABLE_CODE
  );
}

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

const FORBIDDEN_RESULT_KEYS = new Set([
  "access_key_id",
  "authorization",
  "bearer_token",
  "catalog_id",
  "city_id",
  "client_secret",
  "credentials",
  "inventory_id",
  "object_key",
  "organization_id",
  "password",
  "private_key",
  "project_id",
  "s3_key",
  "secret_access_key",
  "signed_url",
  "source_id",
  "storage_path",
  "token",
  "user_id",
]);

function redactForbiddenResultFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactForbiddenResultFields);
  }
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !FORBIDDEN_RESULT_KEYS.has(key.toLowerCase()))
      .map(([key, child]) => [key, redactForbiddenResultFields(child)]),
  );
}

function assertBoundedSafeResult(value: unknown): Record<string, unknown> {
  const safeResult = redactForbiddenResultFields(value);
  const serialized = JSON.stringify(safeResult);
  if (
    serialized == null ||
    serialized.length > 64 * 1024 ||
    /(?:s3:\/\/|amazonaws\.com|Bearer\s|private\/raw)/i.test(serialized)
  ) {
    throw nativeInputCapabilityUnavailable();
  }
  if (
    !safeResult ||
    typeof safeResult !== "object" ||
    Array.isArray(safeResult)
  ) {
    throw nativeInputCapabilityUnavailable();
  }
  return safeResult as Record<string, unknown>;
}

export async function readNativeInputCapability(
  request: NativeInputSelectedReadRequest,
  session: AppSession,
  dependencies: NativeInputCapabilityServiceDependencies = defaultDependencies,
): Promise<NativeInputCapabilityResponse> {
  if (!session.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }

  if (request.userId && request.userId !== session.user.id) {
    throw nativeInputCapabilityUnavailable();
  }

  const resolvedDependencies = { ...defaultDependencies, ...dependencies };

  try {
    const findCatalogEntryById = resolvedDependencies.findCatalogEntryById;
    if (!findCatalogEntryById) throw nativeInputCapabilityUnavailable();

    const entry = await findCatalogEntryById(request.catalogId);
    if (!entry || entry.availability !== "active") {
      throw nativeInputCapabilityUnavailable();
    }

    const definition = (
      resolvedDependencies.resolveCapability ??
      getNativeInputCapabilityDefinition
    )(entry);
    if (
      !definition ||
      !definition.capabilityIds.includes(request.capabilityId)
    ) {
      throw nativeInputCapabilityUnavailable();
    }

    const adapter = resolvedDependencies.getSourceAdapter(entry);
    if (!adapter) throw nativeInputCapabilityUnavailable();
    if (
      !(await resolvedDependencies.authorizeCatalogScope(
        session,
        request,
        entry,
      ))
    ) {
      throw nativeInputCapabilityUnavailable();
    }
    if (!(await adapter.probeReadiness(entry))) {
      throw nativeInputCapabilityUnavailable();
    }

    const parsedInput = definition.schemas.input.safeParse(request.input);
    if (!parsedInput.success) throw nativeInputCapabilityUnavailable();

    const sourceResult = await adapter.executeSelected({
      entry,
      capabilityId: request.capabilityId,
      input: parsedInput.data,
    });
    const response = {
      action: request.capabilityId,
      success: true as const,
      data: assertBoundedSafeResult(sourceResult),
    };
    if (!definition.schemas.output.safeParse(response).success) {
      throw nativeInputCapabilityUnavailable();
    }
    return response;
  } catch (error) {
    if (isNativeInputCapabilityUnavailable(error)) throw error;
    throw nativeInputCapabilityUnavailable();
  }
}
