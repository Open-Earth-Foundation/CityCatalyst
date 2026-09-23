import { afterAll, beforeEach, expect, jest, test } from "@jest/globals";
import { NextRequest } from "next/server";

const cleanup = jest.fn<(ids: string[]) => Promise<void>>();
jest.unstable_mockModule("@/backend/ConceptNoteDeletionService", () => ({
  deleteConceptNoteSources: cleanup,
}));
jest.unstable_mockModule("@/models", () => ({ db: { initialized: true } }));
jest.unstable_mockModule("@/lib/auth", () => ({ Auth: {} }));
jest.unstable_mockModule("@/lib/auth/access-token-validator", () => ({
  isPATToken: jest.fn(),
  validatePAT: jest.fn(),
}));
jest.unstable_mockModule("@/lib/highlight", () => ({ H: null }));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
const { DELETE } =
  await import("@/app/api/v1/internal/ca/concept-note-sources/route");
const previousKey = process.env.CC_SERVICE_API_KEY;
const upload = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  cleanup.mockReset();
  cleanup.mockResolvedValue();
  process.env.CC_SERVICE_API_KEY = "test-cnb-key";
});
afterAll(() => {
  if (previousKey === undefined) delete process.env.CC_SERVICE_API_KEY;
  else process.env.CC_SERVICE_API_KEY = previousKey;
});
async function request(ids: string[], key?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (key) headers["X-CA-Service-Key"] = key;
  return DELETE(
    new NextRequest(
      "http://localhost/api/v1/internal/ca/concept-note-sources",
      {
        method: "DELETE",
        headers,
        body: JSON.stringify({ upload_ids: ids }),
      },
    ),
    { params: Promise.resolve({}) },
  );
}
test.each([undefined, "wrong-key"])(
  "rejects missing or invalid service authentication (%s)",
  async (key) => {
    expect((await request([upload], key)).status).toBe(401);
    expect(cleanup).not.toHaveBeenCalled();
  },
);
test("fails closed if service authentication is not configured", async () => {
  delete process.env.CC_SERVICE_API_KEY;
  expect((await request([upload], "test-cnb-key")).status).toBe(401);
  expect(cleanup).not.toHaveBeenCalled();
});
test("rejects arbitrary paths even from the service", async () => {
  expect((await request(["../../imports"], "test-cnb-key")).status).toBe(400);
  expect(cleanup).not.toHaveBeenCalled();
});
test("deduplicates authenticated upload identities", async () => {
  expect((await request([upload, upload], "test-cnb-key")).status).toBe(204);
  expect(cleanup).toHaveBeenCalledWith([upload]);
});
