import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import createHttpError from "http-errors";
import { Op, type WhereOptions } from "sequelize";
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
const DISCOVERY_CANDIDATE_BATCH_SIZE = 100;
const DISCOVERY_CANDIDATE_SCAN_LIMIT = 200;
const DISCOVERY_CURSOR_VERSION = 1;
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
  cursor?: string;
};

export type NativeInputDiscoveryPage = {
  entries: NativeInputDiscoveryEntry[];
  continuationCursor?: string;
};

type NativeInputCatalogKeyset = {
  created: string;
  id: string;
};

/**
 * Request scope fields that narrow catalog candidates. A row matches a field
 * when the request omits it, the row omits it, or both are equal. The SQL
 * candidate filter and the in-memory check use this one list and rule.
 */
const CANDIDATE_SCOPE_FIELDS = AUTHORIZED_SCOPE_FIELDS;

type CandidateScopeField = (typeof CANDIDATE_SCOPE_FIELDS)[number];

export type NativeInputCandidateScope = Partial<
  Record<CandidateScopeField, string>
>;

type NativeInputCatalogCandidateQuery = {
  after?: NativeInputCatalogKeyset;
  limit: number;
  scope?: NativeInputCandidateScope;
};

type NativeInputDiscoveryCursorPayload = {
  v: number;
  created: string;
  id: string;
  userId: string;
  filters: Record<string, string>;
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
  created?: Date | string;
};

export interface NativeInputCapabilityServiceDependencies {
  findActiveCatalogEntries: (
    query: NativeInputCatalogCandidateQuery,
  ) => Promise<CatalogEntry[]>;
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

/** Build the SQL conditions equivalent to the in-memory scope rule. */
export function buildCandidateScopeConditions(
  scope: NativeInputCandidateScope = {},
): WhereOptions[] {
  return CANDIDATE_SCOPE_FIELDS.flatMap((field) => {
    const value = scope[field];
    if (!value) return [];
    return [{ [Op.or]: [{ [field]: null }, { [field]: value }] }];
  });
}

const defaultDependencies: NativeInputCapabilityServiceDependencies = {
  async findActiveCatalogEntries(query) {
    const where: WhereOptions = { availability: "active" };
    // Narrow candidates in SQL so a large catalog does not push the caller's
    // rows onto later pages; authorization still runs per row afterwards.
    const scopeConditions = buildCandidateScopeConditions(query.scope);
    if (scopeConditions.length > 0) {
      Object.assign(where, { [Op.and]: scopeConditions });
    }
    if (query.after) {
      const afterCreated = new Date(query.after.created);
      Object.assign(where, {
        [Op.or]: [
          { created: { [Op.gt]: afterCreated } },
          {
            created: afterCreated,
            id: { [Op.gt]: query.after.id },
          },
        ],
      });
    }
    const rows = await db.models.NativeInputCatalog.findAll({
      where,
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
        "created",
      ],
      order: [
        ["created", "ASC"],
        ["id", "ASC"],
      ],
      limit: query.limit,
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

/**
 * In-memory twin of the SQL candidate filter. Rows are scoped, never owned by
 * the creator: authorizeCatalogScope decides access from city and project.
 */
export function requestMatchesEntry(
  request: NativeInputDiscoveryRequest,
  entry: CatalogEntry,
): boolean {
  return CANDIDATE_SCOPE_FIELDS.every((field) => {
    const requestValue = request[field];
    const entryValue = entry[field];
    return !requestValue || !entryValue || requestValue === entryValue;
  });
}

function candidateScope(
  request: NativeInputDiscoveryRequest,
): NativeInputCandidateScope {
  return Object.fromEntries(
    CANDIDATE_SCOPE_FIELDS.flatMap((field) =>
      request[field] ? [[field, request[field]]] : [],
    ),
  );
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

async function checkCityProjectAccess(
  session: AppSession,
  cityId: string,
  projectId: string,
): Promise<boolean> {
  try {
    // Never pass inventoryId here: it would open the public-inventory path,
    // and HIAP-MEED data must not be readable that way.
    await PermissionService.checkAccess(
      session,
      { cityId, projectId },
      { includeResource: false },
    );
    return true;
  } catch (error) {
    if (isSafePermissionMiss(error)) return false;
    throw error;
  }
}

type RowCityProject = { cityId: string; projectId: string };

/**
 * Resolve the city and project a row belongs to from the database and fail
 * closed when the row, the request and the database disagree.
 */
async function resolveRowCityProject(
  request: NativeInputDiscoveryRequest,
  entry: CatalogEntry,
): Promise<RowCityProject | null> {
  let cityId = entry.cityId ?? undefined;

  if (entry.inventoryId) {
    const inventory = await db.models.Inventory.findByPk(entry.inventoryId, {
      attributes: ["inventoryId", "cityId"],
    });
    if (!inventory?.cityId) return null;
    if (cityId && cityId !== inventory.cityId) return null;
    cityId = inventory.cityId;
  }
  if (!cityId) return null;
  if (request.cityId && request.cityId !== cityId) return null;

  if (request.inventoryId && !entry.inventoryId) {
    // A city-level row may serve any year of the same city and project.
    const requested = await db.models.Inventory.findByPk(request.inventoryId, {
      attributes: ["inventoryId", "cityId"],
    });
    if (requested?.cityId !== cityId) return null;
  }

  const city = await db.models.City.findByPk(cityId, {
    attributes: ["cityId", "projectId"],
    include: [
      {
        model: db.models.Project,
        as: "project",
        attributes: ["projectId", "organizationId"],
      },
    ],
  });
  if (!city?.projectId) return null;
  if (entry.projectId && entry.projectId !== city.projectId) return null;
  if (request.projectId && request.projectId !== city.projectId) return null;
  const organizationId = city.project?.organizationId;
  if (entry.organizationId && entry.organizationId !== organizationId) {
    return null;
  }
  if (request.organizationId && request.organizationId !== organizationId) {
    return null;
  }
  return { cityId, projectId: city.projectId };
}

/**
 * Rows without a city or inventory (project- or organization-level) keep the
 * per-dimension checks. Fail closed: a row that names neither a project nor an
 * organization (for example a userId-only row) has nothing to authorize
 * against and is never readable.
 */
async function authorizeCoarseScope(
  session: AppSession,
  request: NativeInputDiscoveryRequest,
  entry: CatalogEntry,
): Promise<boolean> {
  if (!entry.projectId && !entry.organizationId) return false;
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

/**
 * Authorize a catalog row at city and project, without a reason-bearing
 * denial value. A user passes when they are an organization admin, a project
 * admin of the row's project or a collaborator of the row's city, and then
 * every inventory and year of that city and project is readable. The creator
 * of the row has no special right. Public inventories grant nothing here.
 */
export async function authorizeCatalogScope(
  session: AppSession,
  request: NativeInputDiscoveryRequest,
  entry: CatalogEntry,
): Promise<boolean> {
  if (!session.user?.id) return false;
  if (!requestMatchesEntry(request, entry)) return false;

  if (!entry.cityId && !entry.inventoryId) {
    return authorizeCoarseScope(session, request, entry);
  }

  const scope = await resolveRowCityProject(request, entry);
  if (!scope) return false;
  return checkCityProjectAccess(session, scope.cityId, scope.projectId);
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

function discoveryFilterBinding(
  request: NativeInputDiscoveryRequest,
): Record<string, string> {
  return {
    ...(request.userId ? { userId: request.userId } : {}),
    ...(request.organizationId
      ? { organizationId: request.organizationId }
      : {}),
    ...(request.projectId ? { projectId: request.projectId } : {}),
    ...(request.cityId ? { cityId: request.cityId } : {}),
    ...(request.inventoryId ? { inventoryId: request.inventoryId } : {}),
    ...(request.kind ? { kind: request.kind } : {}),
    ...(request.owningModule ? { owningModule: request.owningModule } : {}),
    ...(request.capabilityId ? { capabilityId: request.capabilityId } : {}),
  };
}

const DISCOVERY_CURSOR_HKDF_SALT = "cc-native-input-discovery-cursor-v1";
const DISCOVERY_CURSOR_HKDF_INFO = "aes-256-gcm";

function discoveryCursorIkm(): string {
  return (
    process.env.NATIVE_INPUT_DISCOVERY_CURSOR_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "cc-native-input-discovery-cursor"
  );
}

function discoveryCursorSecret(): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      discoveryCursorIkm(),
      DISCOVERY_CURSOR_HKDF_SALT,
      DISCOVERY_CURSOR_HKDF_INFO,
      32,
    ),
  );
}

function encodeDiscoveryCursor(payload: NativeInputDiscoveryCursorPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", discoveryCursorSecret(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}

function decodeDiscoveryCursor(
  token: string,
): NativeInputDiscoveryCursorPayload | null {
  try {
    const buffer = Buffer.from(token, "base64url");
    if (buffer.length < 29) return null;
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      discoveryCursorSecret(),
      iv,
    );
    decipher.setAuthTag(tag);
    const json = Buffer.concat([
      decipher.update(buffer.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
    const payload = JSON.parse(json) as NativeInputDiscoveryCursorPayload;
    if (
      payload?.v !== DISCOVERY_CURSOR_VERSION ||
      typeof payload.created !== "string" ||
      typeof payload.id !== "string" ||
      typeof payload.userId !== "string" ||
      !payload.filters ||
      typeof payload.filters !== "object"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function invalidDiscoveryCursor(): never {
  throw new createHttpError.BadRequest("Invalid discovery cursor.");
}

function resolvedDiscoveryCursor(
  request: NativeInputDiscoveryRequest,
  session: AppSession,
): NativeInputCatalogKeyset | undefined {
  if (!request.cursor) return undefined;
  const payload = decodeDiscoveryCursor(request.cursor);
  if (!payload || payload.userId !== session.user.id) {
    invalidDiscoveryCursor();
  }
  const expectedFilters = JSON.stringify(discoveryFilterBinding(request));
  const actualFilters = JSON.stringify(payload.filters);
  if (expectedFilters !== actualFilters) {
    invalidDiscoveryCursor();
  }
  return { created: payload.created, id: payload.id };
}

function candidateKeyset(entry: CatalogEntry): NativeInputCatalogKeyset {
  const created =
    entry.created instanceof Date
      ? entry.created.toISOString()
      : typeof entry.created === "string"
        ? new Date(entry.created).toISOString()
        : new Date(0).toISOString();
  return { created, id: entry.id };
}

export async function discoverNativeInputs(
  request: NativeInputDiscoveryRequest,
  session: AppSession,
  dependencies: NativeInputCapabilityServiceDependencies = defaultDependencies,
): Promise<NativeInputDiscoveryPage> {
  // Authorize and project before counting the public page. Stop after a fixed
  // candidate-work budget and return a cursor even when the safe page is short.
  if (!session.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  if (request.userId && request.userId !== session.user.id) {
    throw new createHttpError.Forbidden(
      "Request user does not match authenticated service token",
    );
  }

  const filters = discoveryFilterBinding(request);
  let after = resolvedDiscoveryCursor(request, session);
  const discovered: NativeInputDiscoveryEntry[] = [];
  let lastScanned: NativeInputCatalogKeyset | undefined;
  let exhausted = false;
  let scanned = 0;

  while (
    discovered.length < DISCOVERY_RESULT_LIMIT &&
    scanned < DISCOVERY_CANDIDATE_SCAN_LIMIT
  ) {
    const batchLimit = Math.min(
      DISCOVERY_CANDIDATE_BATCH_SIZE,
      DISCOVERY_CANDIDATE_SCAN_LIMIT - scanned,
    );
    const batch = await dependencies.findActiveCatalogEntries({
      after,
      limit: batchLimit,
      scope: candidateScope(request),
    });
    if (batch.length === 0) {
      exhausted = true;
      break;
    }

    for (const entry of batch) {
      lastScanned = candidateKeyset(entry);
      scanned += 1;
      const projected = await filterCatalogEntry(
        entry,
        request,
        session,
        dependencies,
      );
      if (!projected) continue;
      discovered.push(projected);
      if (discovered.length === DISCOVERY_RESULT_LIMIT) break;
    }

    if (discovered.length === DISCOVERY_RESULT_LIMIT) break;
    if (batch.length < batchLimit) {
      exhausted = true;
      break;
    }
    after = lastScanned;
  }

  const page: NativeInputDiscoveryPage = { entries: discovered };
  if (!exhausted && lastScanned) {
    page.continuationCursor = encodeDiscoveryCursor({
      v: DISCOVERY_CURSOR_VERSION,
      created: lastScanned.created,
      id: lastScanned.id,
      userId: session.user.id,
      filters,
    });
  }
  return page;
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

/**
 * Fill city/inventory identifiers missing from the submitted input using the
 * authorized catalog row, so callers scoped by inventory alone can still read.
 */
function withEntryScope(input: unknown, entry: CatalogEntry): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return input;
  }
  const scoped: Record<string, unknown> = { ...input };
  if (!scoped.city_id && entry.cityId) scoped.city_id = entry.cityId;
  if (!scoped.inventory_id && entry.inventoryId) {
    scoped.inventory_id = entry.inventoryId;
  }
  return scoped;
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

    const parsedInput = definition.schemas.input.safeParse(
      withEntryScope(request.input, entry),
    );
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
