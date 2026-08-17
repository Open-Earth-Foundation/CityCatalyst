import { afterAll, beforeAll, describe, it } from "@jest/globals";
import { POST as createUserInvites } from "@/app/api/v1/user/invites/route";
import { db } from "@/models";
import { expectStatusCode, mockRequest, setupTests } from "../helpers";
import { randomUUID } from "node:crypto";

describe("User Invites API", () => {
  beforeAll(async () => {
    setupTests();
    await db.initialize();
  });

  afterAll(async () => {
    if (db.sequelize) await db.sequelize.close();
  });

  it("should reject an invite request with no cities selected", async () => {
    const req = mockRequest({
      projectId: randomUUID(),
      cityIds: [],
      invites: [{ email: "no-cities-selected@example.com", role: "collaborator" }],
    });
    const res = await createUserInvites(req, {
      params: Promise.resolve({}),
    });

    await expectStatusCode(res, 400);
  });
});
