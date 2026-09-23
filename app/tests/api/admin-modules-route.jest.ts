import { db } from "@/models";
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  jest,
} from "@jest/globals";
import {
  setupTests,
  mockRequest,
  expectStatusCode,
  testUserID,
} from "../helpers";
import { randomUUID } from "crypto";
import { AppSession, Auth } from "@/lib/auth";
import { Roles } from "@/util/types";

const mockAdminSession: AppSession = {
  user: { id: testUserID, role: Roles.Admin },
  expires: "1h",
};

const translateModuleFields = jest.fn<
  () => Promise<{
    name: Record<string, string>;
    description: Record<string, string>;
    tagline: Record<string, string>;
  }>
>();

jest.unstable_mockModule("@/util/translate", () => ({
  translateModuleFields,
}));

let PUT: typeof import("@/app/api/v1/admin/modules/[module]/route").PUT;

beforeAll(async () => {
  ({ PUT } = await import("@/app/api/v1/admin/modules/[module]/route"));
});

describe("Admin Module Edit Route", () => {
  let moduleId: string;

  beforeAll(async () => {
    setupTests();
    await db.initialize();
  });

  afterAll(async () => {
    if (db.sequelize) await db.sequelize.close();
  });

  beforeEach(() => {
    jest.spyOn(Auth, "getServerSession").mockResolvedValue(mockAdminSession);
    translateModuleFields.mockReset();
  });

  afterEach(async () => {
    if (moduleId) {
      await db.models.Module.destroy({ where: { id: moduleId } });
    }
    jest.restoreAllMocks();
  });

  it("sets isManuallyEdited to true when a POC module is edited", async () => {
    moduleId = randomUUID();
    await db.models.Module.create({
      id: moduleId,
      type: "POC",
      stage: "explore",
      name: { en: "Original name" },
      description: { en: "Original description" },
      tagline: { en: "Original tagline" },
      status: "poc",
      author: "Open Earth Foundation",
      url: "/original",
    });

    const req = mockRequest({ stage: "implement" });
    const ctx = { params: Promise.resolve({ module: moduleId }) };
    const response = await PUT(req, ctx);
    await expectStatusCode(response, 200);

    const updated = await db.models.Module.findByPk(moduleId);
    expect(updated!.isManuallyEdited).toBe(true);
    expect(updated!.stage).toBe("implement");
    expect(translateModuleFields).not.toHaveBeenCalled();
  });

  it("translates and marks isManuallyEdited when name changes", async () => {
    moduleId = randomUUID();
    await db.models.Module.create({
      id: moduleId,
      type: "POC",
      stage: "explore",
      name: { en: "Original name" },
      description: { en: "Original description" },
      tagline: { en: "Original tagline" },
      status: "poc",
      author: "Open Earth Foundation",
      url: "/original",
    });

    translateModuleFields.mockResolvedValue({
      name: { en: "New name" },
      description: {},
      tagline: {},
    });

    const req = mockRequest({ name: "New name" });
    const ctx = { params: Promise.resolve({ module: moduleId }) };
    const response = await PUT(req, ctx);
    await expectStatusCode(response, 200);

    const updated = await db.models.Module.findByPk(moduleId);
    expect(updated!.isManuallyEdited).toBe(true);
    expect(updated!.name.en).toBe("New name");
  });

  it("returns 403 when trying to edit a non-POC (seeded) module", async () => {
    moduleId = randomUUID();
    await db.models.Module.create({
      id: moduleId,
      type: "OEF",
      stage: "explore",
      name: { en: "Seeded module" },
      description: { en: "Seeded description" },
      tagline: { en: "Seeded tagline" },
      status: "active",
      author: "Open Earth Foundation",
      url: "/seeded",
    });

    const req = mockRequest({ stage: "implement" });
    const ctx = { params: Promise.resolve({ module: moduleId }) };
    const response = await PUT(req, ctx);
    await expectStatusCode(response, 403);

    const updated = await db.models.Module.findByPk(moduleId);
    expect(updated!.isManuallyEdited).toBe(false);
  });
});
