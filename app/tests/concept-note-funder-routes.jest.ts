import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import { funderRequest as funder } from "./fixtures/concept-note-funder";

const runId = "11111111-1111-4111-8111-111111111111";
const uploadId = "22222222-2222-4222-8222-222222222222";
const cityId = "33333333-3333-4333-8333-333333333333";
const loadRunCity = jest.fn<(...args: unknown[]) => Promise<string>>();
const callApi = jest.fn<(...args: unknown[]) => Promise<Response>>();
jest.unstable_mockModule("@/backend/ConceptNoteUploadService", () => ({
  loadConceptNoteRunCity: loadRunCity,
}));
jest.unstable_mockModule("@/backend/concept-notes", () => ({
  callAuthorizedConceptNoteApi: callApi,
  readConceptNoteApiPayload: (response: Response) => response.json(),
}));
jest.unstable_mockModule("@/util/api", () => ({
  apiHandler: (handler: unknown) => handler,
}));

type Handler = (req: Request, context: unknown) => Promise<Response>;
let startImport: Handler;
let getImport: Handler;
let discardImport: Handler;
let createFunder: Handler;
const session = { user: { id: "owner" } };
const context = { session, params: { runId } };
const post = (body: unknown) =>
  new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeAll(async () => {
  ({ POST: startImport } =
    (await import("@/app/api/v1/concept-notes/[runId]/funder-imports/route")) as unknown as {
      POST: Handler;
    });
  ({ GET: getImport, DELETE: discardImport } =
    (await import("@/app/api/v1/concept-notes/[runId]/funder-imports/current/route")) as unknown as {
      GET: Handler;
      DELETE: Handler;
    });
  ({ POST: createFunder } =
    (await import("@/app/api/v1/concept-notes/[runId]/funders/route")) as unknown as {
      POST: Handler;
    });
});
beforeEach(() => {
  jest.clearAllMocks();
  loadRunCity.mockResolvedValue(cityId);
  callApi.mockResolvedValue(
    Response.json({ funder_import: null }, { status: 200 }),
  );
});

describe("Funder API boundary", () => {
  it.each(["funder", "template"] as const)(
    "starts a %s import after the city check",
    async (kind) => {
      callApi.mockResolvedValue(
        Response.json(
          { funder_import: { status: "processing" } },
          { status: 202 },
        ),
      );
      const response = await startImport(
        post(kind === "funder" ? { uploadId } : { uploadId, kind }),
        context,
      );
      expect(response.status).toBe(202);
      expect(callApi).toHaveBeenCalledWith(
        expect.objectContaining({
          cityId,
          session,
          path: `/v1/concept-notes/${runId}/funder-imports`,
          method: "POST",
          body: { upload_id: uploadId, kind },
          searchParams: { user_id: "owner" },
        }),
      );
    },
  );

  it("reads and discards the current import, keeping upstream codes", async () => {
    const read = await getImport(new Request("http://localhost"), context);
    expect(await read.json()).toEqual({ funder_import: null });

    callApi.mockResolvedValue(new Response(null, { status: 204 }));
    const discarded = await discardImport(
      new Request(`http://localhost?importId=${uploadId}`, {
        method: "DELETE",
      }),
      context,
    );
    expect(discarded.status).toBe(204);
    expect(callApi).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: "DELETE",
        body: undefined,
        searchParams: { import_id: uploadId, user_id: "owner" },
      }),
    );

    const detail = { code: "funder_import_running", message: "No" };
    callApi.mockResolvedValue(Response.json({ detail }, { status: 409 }));
    const conflict = await startImport(post({ uploadId }), context);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ detail });
  });

  it("forwards reviewed funder values", async () => {
    const created = { funder_id: "f", funding_opportunity_id: "o" };
    callApi.mockResolvedValue(Response.json(created, { status: 201 }));
    const response = await createFunder(post(funder), context);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(created);
    expect(callApi).toHaveBeenCalledWith(
      expect.objectContaining({
        cityId,
        session,
        path: `/v1/concept-notes/${runId}/funders`,
        method: "POST",
        searchParams: { user_id: "owner" },
        body: funder,
      }),
    );
  });

  it.each([404, 409, 500])(
    "strips internal problem metadata while preserving public errors at %s",
    async (status) => {
      const detail = {
        code: "funder_import_pending",
        message: "Review the draft",
      };
      callApi.mockResolvedValue(
        Response.json(
          {
            detail: { ...detail, error: "internal secret" },
            instance: "http://internal-ca/funder-imports?user_id=private",
            title: "internal secret",
          },
          { status },
        ),
      );
      const response = await startImport(post({ uploadId }), context);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ detail });
    },
  );

  it.each([
    { message: "internal secret" },
    { code: { nested: "internal secret" } },
    "internal secret",
  ])("drops errors outside the public contract: %j", async (detail) => {
    callApi.mockResolvedValue(Response.json({ detail }, { status: 500 }));
    const response = await getImport(new Request("http://localhost"), context);
    expect(await response.json()).toEqual({ detail: "" });
  });

  it("does not serialize an object-valued error message", async () => {
    callApi.mockResolvedValue(
      Response.json(
        {
          detail: {
            code: "funder_import_changed",
            message: { error: "internal secret" },
          },
        },
        { status: 409 },
      ),
    );
    const response = await getImport(new Request("http://localhost"), context);
    expect(await response.json()).toEqual({
      detail: { code: "funder_import_changed" },
    });
  });

  it.each([
    [
      "a discard without an import id",
      () =>
        discardImport(
          new Request("http://localhost", { method: "DELETE" }),
          context,
        ),
    ],
    [
      "an invalid discard import id",
      () =>
        discardImport(
          new Request("http://localhost?importId=invalid", {
            method: "DELETE",
          }),
          context,
        ),
    ],
    [
      "a discard with the import id only in the obsolete body",
      () => discardImport(post({ importId: uploadId }), context),
    ],
    [
      "an invalid upload id",
      () => startImport(post({ uploadId: "x" }), context),
    ],
    [
      "an empty funder name",
      () =>
        createFunder(
          post({ ...funder, funder: { ...funder.funder, name: " " } }),
          context,
        ),
    ],
  ])("rejects %s before any upstream call", async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ name: "ZodError" });
    expect(callApi).not.toHaveBeenCalled();
  });

  it.each([
    [
      "reading an import",
      () =>
        getImport(new Request("http://localhost"), {
          ...context,
          session: null,
        }),
    ],
    [
      "creating a funder",
      () => createFunder(post(funder), { ...context, session: null }),
    ],
    [
      "creating with invalid details",
      () => createFunder(post({}), { ...context, session: null }),
    ],
  ])("requires authentication before %s", async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ statusCode: 401 });
    expect(callApi).not.toHaveBeenCalled();
  });
});
