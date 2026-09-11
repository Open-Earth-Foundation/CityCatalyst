import { afterAll, beforeEach, expect, jest, test } from "@jest/globals";
import * as s3 from "@aws-sdk/client-s3";

const send =
  jest.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>();
const previousBucket = process.env.AWS_FILE_UPLOAD_S3_BUCKET_ID;
process.env.AWS_FILE_UPLOAD_S3_BUCKET_ID = "test-cnb-deletion";
jest.unstable_mockModule("@aws-sdk/client-s3", () => ({
  ...s3,
  S3Client: class {
    send = send;
  },
}));
const { default: storage } =
  await import("@/backend/InventoryFileStorageService");
afterAll(() => {
  if (previousBucket === undefined)
    delete process.env.AWS_FILE_UPLOAD_S3_BUCKET_ID;
  else process.env.AWS_FILE_UPLOAD_S3_BUCKET_ID = previousBucket;
});
beforeEach(() => {
  send.mockReset();
});
const upload = "11111111-1111-4111-8111-111111111111";

test("deletes paginated source and OCR result objects only under the upload prefixes", async () => {
  const source = `pdf-ocr/sources/concept_note_upload/${upload}/source.pdf`;
  const result = `pdf-ocr/results/concept_note_upload/${upload}/1/combined_markdown.md`;
  send
    .mockResolvedValueOnce({
      Contents: [{ Key: source }],
      NextContinuationToken: "page-2",
    })
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ Contents: [] })
    .mockResolvedValueOnce({ Contents: [{ Key: result }] })
    .mockResolvedValueOnce({});
  await storage.deleteConceptNoteSource(upload);
  const commands = send.mock.calls.map(
    ([command]) => command as { input: Record<string, unknown> },
  );
  expect(commands.map((c) => c.input)).toEqual([
    {
      Bucket: "test-cnb-deletion",
      Prefix: `pdf-ocr/sources/concept_note_upload/${upload}/`,
      ContinuationToken: undefined,
    },
    {
      Bucket: "test-cnb-deletion",
      Delete: { Objects: [{ Key: source }], Quiet: true },
    },
    {
      Bucket: "test-cnb-deletion",
      Prefix: `pdf-ocr/sources/concept_note_upload/${upload}/`,
      ContinuationToken: "page-2",
    },
    {
      Bucket: "test-cnb-deletion",
      Prefix: `pdf-ocr/results/concept_note_upload/${upload}/`,
      ContinuationToken: undefined,
    },
    {
      Bucket: "test-cnb-deletion",
      Delete: { Objects: [{ Key: result }], Quiet: true },
    },
  ]);
});

test("fails on partial S3 deletion errors instead of reporting success", async () => {
  send
    .mockResolvedValueOnce({ Contents: [{ Key: "artifact" }] })
    .mockResolvedValueOnce({ Errors: [{ Code: "AccessDenied" }] });
  await expect(storage.deleteConceptNoteSource(upload)).rejects.toThrow(
    "cleanup failed",
  );
});

test("rejects arbitrary paths before storage access", async () => {
  await expect(
    storage.deleteConceptNoteSource("../../imports"),
  ).rejects.toThrow("Invalid");
  expect(send).not.toHaveBeenCalled();
});
