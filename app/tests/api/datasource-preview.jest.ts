import { GET as getDataSourcePreview } from "@/app/api/v1/datasource/preview/route";
import { db } from "@/models";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { mockRequest, setupTests, testCityID, testUserID } from "../helpers";
import { Auth } from "@/lib/auth";
import { AppSession } from "@/lib/auth";
import { Roles } from "@/util/types";

const mockSession: AppSession = {
  user: { id: testUserID, role: Roles.User },
  expires: "1h",
};

describe("Data source preview API", () => {
  let prevGetServerSession = Auth.getServerSession;

  beforeAll(async () => {
    setupTests();
    await db.initialize();
  });

  afterAll(async () => {
    Auth.getServerSession = prevGetServerSession;
    if (db.sequelize) await db.sequelize.close();
  });

  beforeEach(() => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockSession));
  });

  it("returns preview sources for a city and year", async () => {
    const req = mockRequest(undefined, {
      cityId: testCityID,
      year: "2022",
      inventoryType: "gpc_basic",
    });
    const res = await getDataSourcePreview(req, {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(typeof body.data.count).toBe("number");
    expect(Array.isArray(body.data.sources)).toBe(true);
  });

  it("rejects missing cityId", async () => {
    const req = mockRequest(undefined, { year: "2022" });
    const res = await getDataSourcePreview(req, {
      params: Promise.resolve({}),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
