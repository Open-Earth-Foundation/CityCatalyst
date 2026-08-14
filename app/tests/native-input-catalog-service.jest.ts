import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const catalogModel = {
  create: jest.fn(),
  findByPk: jest.fn(),
  findOne: jest.fn(),
};

const mockTransaction = { LOCK: { UPDATE: "UPDATE" } };
const mockDb = {
  models: { NativeInputCatalog: catalogModel },
  sequelize: {
    transaction: jest.fn(
      async (callback: (transaction: typeof mockTransaction) => unknown) =>
        callback(mockTransaction),
    ),
  },
};

jest.unstable_mockModule("@/models", () => ({ db: mockDb }));
jest.mock("@/models", () => ({ db: mockDb }));

let registerNativeInput: typeof import("@/backend/NativeInputCatalogService").registerNativeInput;
let supersedeNativeInput: typeof import("@/backend/NativeInputCatalogService").supersedeNativeInput;
let withdrawNativeInput: typeof import("@/backend/NativeInputCatalogService").withdrawNativeInput;
let requireNativeInputCatalogServiceRequest: typeof import("@/backend/NativeInputCatalogService").requireNativeInputCatalogServiceRequest;

beforeAll(async () => {
  ({
    registerNativeInput,
    supersedeNativeInput,
    withdrawNativeInput,
    requireNativeInputCatalogServiceRequest,
  } = await import("@/backend/NativeInputCatalogService"));
});

afterEach(() => {
  jest.clearAllMocks();
});

const registration = {
  kind: "inventory_source_file",
  owningModule: "ghgi",
  sourceType: "imported_inventory_file",
  sourceId: "source-file-1",
  inventoryId: "11111111-1111-4111-8111-111111111111",
};

function makeCatalog(overrides: Record<string, unknown> = {}) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    availability: "active",
    update: jest.fn(),
    ...overrides,
  };
}

describe("NativeInputCatalogService", () => {
  it("rejects registrations without a scope identifier", async () => {
    await expect(
      registerNativeInput({
        kind: registration.kind,
        owningModule: registration.owningModule,
        sourceType: registration.sourceType,
        sourceId: registration.sourceId,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("returns an existing non-withdrawn registration idempotently", async () => {
    const existing = makeCatalog();
    catalogModel.findOne.mockResolvedValue(existing);

    const result = await registerNativeInput(registration);

    expect(result).toEqual({ catalog: existing, created: false });
    expect(catalogModel.create).not.toHaveBeenCalled();
  });

  it("repairs a missing digest when an idempotent retry supplies one", async () => {
    const existing = makeCatalog({ contentDigest: null });
    catalogModel.findOne.mockResolvedValue(existing);

    await registerNativeInput({
      ...registration,
      contentDigest: "source-sha256",
    });

    expect(existing.update).toHaveBeenCalledWith(
      { contentDigest: "source-sha256" },
      { transaction: undefined },
    );
  });

  it("creates a new active registration", async () => {
    const created = makeCatalog();
    catalogModel.findOne.mockResolvedValue(null);
    catalogModel.create.mockResolvedValue(created);

    const result = await registerNativeInput(registration);

    expect(result).toEqual({ catalog: created, created: true });
    expect(catalogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ...registration,
        availability: "active",
        userId: null,
        cityId: null,
        projectId: null,
        organizationId: null,
      }),
      expect.objectContaining({ transaction: undefined }),
    );
  });

  it("withdraws an active entry and is idempotent for withdrawn entries", async () => {
    const active = makeCatalog();
    catalogModel.findByPk.mockResolvedValueOnce(active);

    await withdrawNativeInput(active.id);

    expect(active.update).toHaveBeenCalledWith({ availability: "withdrawn" });

    const withdrawn = makeCatalog({ availability: "withdrawn" });
    catalogModel.findByPk.mockResolvedValueOnce(withdrawn);

    await expect(withdrawNativeInput(withdrawn.id)).resolves.toBe(withdrawn);
    expect(withdrawn.update).not.toHaveBeenCalled();
  });

  it("atomically supersedes an active entry with a new source identity", async () => {
    const current = makeCatalog();
    const replacement = makeCatalog({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    catalogModel.findByPk.mockResolvedValue(current);
    catalogModel.findOne.mockResolvedValue(null);
    catalogModel.create.mockResolvedValue(replacement);

    const result = await supersedeNativeInput(current.id, {
      ...registration,
      sourceId: "source-file-2",
    });

    expect(result).toEqual({ previous: current, replacement });
    expect(current.update).toHaveBeenCalledWith(
      {
        availability: "superseded",
        supersededById: replacement.id,
      },
      { transaction: mockTransaction },
    );
    expect(mockDb.sequelize.transaction).toHaveBeenCalledTimes(1);
  });

  it("requires the shared service key for internal requests", () => {
    process.env.CC_SERVICE_API_KEY = "catalog-test-key";

    expect(() =>
      requireNativeInputCatalogServiceRequest({
        headers: new Headers({
          "X-Service-Name": "ghgi",
          "X-Service-Key": "catalog-test-key",
        }),
      } as never),
    ).not.toThrow();

    let error: unknown;
    try {
      requireNativeInputCatalogServiceRequest({
        headers: new Headers({
          "X-Service-Name": "ghgi",
          "X-Service-Key": "wrong-key",
        }),
      } as never);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ statusCode: 401 });
  });
});
