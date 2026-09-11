import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import createHttpError from "http-errors";
import { NextRequest } from "next/server";
import type { AppSession } from "@/lib/auth";
import { Roles } from "@/util/types";

const runId = "11111111-1111-4111-8111-111111111111";
const cityId = "22222222-2222-4222-8222-222222222222";
const targetId = "33333333-3333-4333-8333-333333333333";
const key = "44444444-4444-4444-8444-444444444444";
const otherCity = "55555555-5555-4555-8555-555555555555";
const session: AppSession = {
  expires: "2027-01-01T00:00:00Z",
  user: { id: "owner-user", role: Roles.User },
};
const getSession = jest.fn<() => Promise<AppSession | null>>();
const canAccessCity = jest.fn<(...args: unknown[]) => Promise<void>>();
const issueToken =
  jest.fn<(...args: unknown[]) => Promise<{ access_token: string }>>();
type UpstreamRequest = {
  path: string;
  method?: string;
  body?: unknown;
  searchParams?: Record<string, string>;
  headers?: Record<string, string>;
};
const upstream = jest.fn<(request: UpstreamRequest) => Promise<Response>>();

jest.unstable_mockModule("@/models", () => ({ db: { initialized: true } }));
jest.unstable_mockModule("@/lib/auth", () => ({
  Auth: { getServerSession: getSession },
}));
jest.unstable_mockModule("@/lib/auth/access-token-validator", () => ({
  isPATToken: jest.fn(),
  validatePAT: jest.fn(),
}));
jest.unstable_mockModule("@/lib/highlight", () => ({ H: null }));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.unstable_mockModule("@/backend/permissions/PermissionService", () => ({
  PermissionService: { canAccessCity },
}));
jest.unstable_mockModule("@/backend/climate-advisor-token", () => ({
  issueClimateAdvisorUserToken: issueToken,
}));
jest.unstable_mockModule("@/backend/chat/climate-advisor", () => ({
  callClimateAdvisorChat: upstream,
}));
// Loading the client error parser does not require the runtime environment script.
jest.unstable_mockModule("@/lib/runtime-env", () => ({ env: () => undefined }));

const collection =
  await import("@/app/api/v1/concept-notes/[runId]/edit-proposals/route");
const read =
  await import("@/app/api/v1/concept-notes/[runId]/edit-proposals/[proposalId]/route");
const apply =
  await import("@/app/api/v1/concept-notes/[runId]/edit-proposals/[proposalId]/apply/route");
const reject =
  await import("@/app/api/v1/concept-notes/[runId]/edit-proposals/[proposalId]/reject/route");
const refine =
  await import("@/app/api/v1/concept-notes/[runId]/edit-proposals/[proposalId]/refine/route");
const confirm =
  await import("@/app/api/v1/concept-notes/[runId]/chapters/[chapterId]/confirm/route");
const reset =
  await import("@/app/api/v1/concept-notes/[runId]/chat/reset/route");
const { editErrorCode } = await import("@/services/concept-note-edit-api");

const proposalBody = {
  instruction: "Improve wording",
  scope: { kind: "auto" },
  idempotency_key: key,
};
const applyBody = {
  expected_revisions: { [targetId]: 2 },
  selected_change_ids: [key],
  idempotency_key: key,
};
const confirmBody = { expected_revision: 2, idempotency_key: key };
const routes = [
  {
    name: "list",
    handler: collection.GET,
    method: "GET",
    suffix: "/edit-proposals",
    body: undefined,
  },
  {
    name: "propose",
    handler: collection.POST,
    method: "POST",
    suffix: "/edit-proposals",
    body: proposalBody,
  },
  {
    name: "read",
    handler: read.GET,
    method: "GET",
    suffix: `/edit-proposals/${targetId}`,
    body: undefined,
  },
  {
    name: "apply",
    handler: apply.POST,
    method: "POST",
    suffix: `/edit-proposals/${targetId}/apply`,
    body: applyBody,
  },
  {
    name: "reject",
    handler: reject.POST,
    method: "POST",
    suffix: `/edit-proposals/${targetId}/reject`,
    body: undefined,
  },
  {
    name: "refine",
    handler: refine.POST,
    method: "POST",
    suffix: `/edit-proposals/${targetId}/refine`,
    body: proposalBody,
  },
  {
    name: "confirm",
    handler: confirm.POST,
    method: "POST",
    suffix: `/chapters/${targetId}/confirm`,
    body: confirmBody,
  },
  {
    name: "reset",
    handler: reset.POST,
    method: "POST",
    suffix: "/chat/reset",
    body: undefined,
  },
];
type Route = (typeof routes)[number];
class RouteRequest extends NextRequest {
  async json() {
    // Keep SyntaxError in Jest's realm; native Undici parses outside its VM.
    return JSON.parse(await this.text());
  }
}
function request(
  route: Route,
  options: {
    params?: Record<string, string>;
    body?: unknown;
    query?: string;
    rawBody?: string;
  } = {},
) {
  return route.handler(
    new RouteRequest(
      `http://localhost/api/v1/concept-notes/${runId}${route.suffix}?${options.query ?? `city_id=${cityId}`}`,
      {
        method: route.method,
        headers: {
          "Content-Type": "application/json",
          "x-request-id": "review-test",
        },
        body:
          options.rawBody ??
          (route.method === "GET"
            ? undefined
            : JSON.stringify(options.body ?? route.body)),
      },
    ),
    {
      params: Promise.resolve({
        runId,
        proposalId: targetId,
        chapterId: targetId,
        ...options.params,
      }),
    },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  getSession.mockResolvedValue(session);
  canAccessCity.mockResolvedValue();
  issueToken.mockResolvedValue({ access_token: "test-user-token" });
  upstream.mockImplementation(async () =>
    Response.json({ run_id: runId, city_id: cityId }),
  );
});

describe.each(routes)("$name route boundary", (route) => {
  test("returns 401 before any upstream call for an unauthenticated request", async () => {
    getSession.mockResolvedValue(null);
    expect((await request(route)).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
    expect(issueToken).not.toHaveBeenCalled();
  });
  test("returns 400 for an invalid run UUID before any upstream call", async () => {
    expect(
      (await request(route, { params: { runId: "not-a-uuid" } })).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  test("returns 403 without forwarding the requested operation when city access is denied", async () => {
    canAccessCity.mockRejectedValueOnce(
      new createHttpError.Forbidden("City access denied"),
    );
    expect((await request(route)).status).toBe(403);
    expect(canAccessCity).toHaveBeenCalledWith(session, cityId, {
      includeResource: false,
    });
    // Run-scoped edit/confirm routes may look up the owning city first.
    expect(
      upstream.mock.calls.every(
        ([args]) => args.path === `/v1/concept-notes/${runId}` && !args.method,
      ),
    ).toBe(true);
    if (route.name === "reset") expect(upstream).not.toHaveBeenCalled();
  });
  test("forwards validated input using the authenticated user and request ID", async () => {
    const response = await request(route, {
      query: `city_id=${cityId}&user_id=attacker`,
    });
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenLastCalledWith({
      path: `/v1/concept-notes/${runId}${route.suffix}`,
      method: route.method,
      body: route.body,
      searchParams: { user_id: session.user.id },
      headers: {
        Authorization: "Bearer test-user-token",
        "X-Request-ID": "review-test",
      },
    });
    expect(issueToken).toHaveBeenLastCalledWith({ userId: session.user.id });
    expect(canAccessCity.mock.invocationCallOrder[0]).toBeLessThan(
      upstream.mock.invocationCallOrder.at(-1)!,
    );
  });
});

test.each(
  routes.filter((route) =>
    ["read", "apply", "reject", "refine", "confirm"].includes(route.name),
  ),
)("$name rejects an invalid target UUID", async (route) => {
  expect(
    (await request(route, { params: { proposalId: "bad", chapterId: "bad" } }))
      .status,
  ).toBe(400);
  expect(upstream).not.toHaveBeenCalled();
});

test.each([
  ["apply", {}],
  ["apply", { ...applyBody, idempotency_key: "bad" }],
  ["apply", { ...applyBody, expected_revisions: {} }],
  ["apply", { ...applyBody, expected_revisions: { [targetId]: 0 } }],
  ["apply", { ...applyBody, selected_change_ids: [] }],
  ["apply", { ...applyBody, selected_change_ids: [key, key] }],
  ["apply", { ...applyBody, selected_change_ids: ["bad"] }],
  ["apply", { ...applyBody, user_id: "attacker" }],
  ["propose", { ...proposalBody, instruction: " " }],
  ["refine", { ...proposalBody, instruction: " " }],
  ["refine", { ...proposalBody, scope: { kind: "all" } }],
  ["refine", { ...proposalBody, refines_proposal_id: "bad" }],
  ["refine", { ...proposalBody, user_id: "attacker" }],
  ["confirm", { ...confirmBody, expected_revision: 0 }],
  ["confirm", { ...confirmBody, expected_revision: 1.5 }],
  ["confirm", { ...confirmBody, idempotency_key: "bad" }],
] as const)("%s rejects invalid body %j", async (name, body) => {
  expect(
    (
      await request(
        routes.find((route) => route.name === name)!,
        { body },
      )
    ).status,
  ).toBe(400);
  expect(upstream).not.toHaveBeenCalled();
});

test.each(routes.filter((route) => route.body))(
  "$name rejects malformed JSON",
  async (route) => {
    expect((await request(route, { rawBody: "{" })).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  },
);

test.each(["apply", "refine", "confirm"])(
  "%s authorizes the run's actual city despite a forged city query",
  async (name) => {
    canAccessCity.mockRejectedValueOnce(
      new createHttpError.Forbidden("City access denied"),
    );
    expect(
      (
        await request(
          routes.find((route) => route.name === name)!,
          { query: `city_id=${otherCity}` },
        )
      ).status,
    ).toBe(403);
    expect(canAccessCity).toHaveBeenCalledWith(session, cityId, {
      includeResource: false,
    });
  },
);

test.each(["apply", "refine", "confirm"])(
  "%s stops if the authenticated run lookup returns 404",
  async (name) => {
    upstream.mockResolvedValueOnce(
      Response.json({ detail: "Run not found" }, { status: 404 }),
    );
    expect(
      (await request(routes.find((route) => route.name === name)!)).status,
    ).toBe(404);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(canAccessCity).not.toHaveBeenCalled();
  },
);

test.each(["apply", "refine", "confirm", "reset"])(
  "%s preserves upstream error status, code and detail for the client",
  async (name) => {
    const payload = { code: "stale_base", detail: "The draft has changed" };
    upstream.mockImplementation(async ({ path }) =>
      path === `/v1/concept-notes/${runId}`
        ? Response.json({ city_id: cityId })
        : Response.json(payload, { status: 409 }),
    );
    const response = await request(
      routes.find((route) => route.name === name)!,
    );
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body).toEqual(payload);
    expect(editErrorCode({ status: response.status, data: body })).toBe(
      "stale_base",
    );
  },
);

test.each(["", "city_id=bad"])(
  "chat reset rejects missing/invalid city query %s",
  async (query) => {
    expect((await request(routes.at(-1)!, { query })).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  },
);

test("chat reset rejects a successful response for a different city", async () => {
  upstream.mockResolvedValueOnce(Response.json({ city_id: otherCity }));
  const response = await request(routes.at(-1)!);
  // The API wrapper masks non-public upstream failures as 500.
  expect(response.status).toBe(500);
  expect(await response.json()).not.toHaveProperty("city_id");
});
