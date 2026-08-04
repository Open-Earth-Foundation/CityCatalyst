import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const runId = "11111111-1111-4111-8111-111111111111";
const uploadId = "22222222-2222-4222-8222-222222222222";
const callConceptNoteApi = jest.fn<() => Promise<Response>>();

jest.unstable_mockModule("@/backend/concept-notes", () => ({
  callConceptNoteApi,
  readConceptNoteApiPayload: (response: Response) => response.json(),
}));

let loadConceptNoteRunCity: typeof import("@/backend/ConceptNoteUploadService").loadConceptNoteRunCity;
let loadConceptNoteUpload: typeof import("@/backend/ConceptNoteUploadService").loadConceptNoteUpload;
let updateConceptNoteUpload: typeof import("@/backend/ConceptNoteUploadService").updateConceptNoteUpload;

beforeAll(async () => {
  ({ loadConceptNoteRunCity, loadConceptNoteUpload, updateConceptNoteUpload } =
    await import("@/backend/ConceptNoteUploadService"));
});

describe("Concept Note upload Climate Advisor adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("maps the snake_case CA run response before returning the city ID", async () => {
    const cityId = "33333333-3333-4333-8333-333333333333";
    callConceptNoteApi.mockResolvedValueOnce(
      Response.json({ city_id: cityId }),
    );

    await expect(
      loadConceptNoteRunCity({ runId, userId: "owner-user" }),
    ).resolves.toBe(cityId);
  });

  it("maps the snake_case CA response to a camelCase service object", async () => {
    callConceptNoteApi.mockResolvedValueOnce(
      Response.json({
        upload_id: uploadId,
        run_id: runId,
        status: "ready",
        filename: "plan.pdf",
        source_label: "Climate plan",
        page_count: 3,
        error_code: null,
        received_at: "2026-07-31T10:00:00Z",
        completed_at: "2026-07-31T10:01:00Z",
      }),
    );

    await expect(
      loadConceptNoteUpload({
        runId,
        uploadId,
        userId: "owner-user",
      }),
    ).resolves.toEqual({
      uploadId,
      runId,
      status: "ready",
      filename: "plan.pdf",
      sourceLabel: "Climate plan",
      pageCount: 3,
      errorCode: null,
      receivedAt: "2026-07-31T10:00:00Z",
      completedAt: "2026-07-31T10:01:00Z",
    });
  });

  it("maps the camelCase error code to the snake_case CA request body", async () => {
    callConceptNoteApi.mockResolvedValueOnce(
      Response.json({ status: "failed" }),
    );

    await updateConceptNoteUpload({
      runId,
      uploadId,
      userId: "owner-user",
      action: "failed",
      errorCode: "ocr_enqueue_failed",
    });

    expect(callConceptNoteApi).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { error_code: "ocr_enqueue_failed" },
      }),
    );
  });
});
