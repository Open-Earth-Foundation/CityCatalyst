import { beforeAll, describe, expect, it, jest } from "@jest/globals";

const requireServiceRequest = jest.fn();
jest.unstable_mockModule(
  "@/backend/agentic/ghgi/stationary-energy/auth",
  () => ({
    requireClimateAdvisorServiceRequest: requireServiceRequest,
  }),
);
jest.unstable_mockModule("@/util/api", () => ({
  apiHandler: (handler: unknown) => handler,
}));

let identityHandler: typeof import("@/app/api/v1/internal/ca/auth/identity/route").POST;
beforeAll(async () => {
  ({ POST: identityHandler } = await import(
    "@/app/api/v1/internal/ca/auth/identity/route"
  ));
});

describe("CC identity validation endpoint", () => {
  it("returns only the canonical authenticated user ID", async () => {
    const request = new Request(
      "http://localhost/api/v1/internal/ca/auth/identity",
      {
        method: "POST",
      },
    );
    const response = await identityHandler(request, {
      session: { user: { id: "canonical-user" } },
    });
    expect(requireServiceRequest).toHaveBeenCalledWith(request);
    expect(await response.json()).toEqual({ user_id: "canonical-user" });
  });

  it("rejects a missing authenticated subject", async () => {
    await expect(
      identityHandler(new Request("http://localhost"), { session: null }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});
