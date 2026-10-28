import { describe, expect, it } from "@jest/globals";

import {
  CONCEPT_NOTE_SOURCE_MAX_BYTES,
  conceptNoteSourceLabel,
  formatFileSize,
  requireConceptNoteUploadIdentity,
  shouldPollConceptNoteUpload,
  uploadStatusTranslationKey,
  validateConceptNoteSourceFile,
} from "@/components/ConceptNoteWiringHarness/utils";

function pdfFile(
  bytes: BlobPart[] = ["%PDF-1.7\nlocal wiring fixture"],
  options: { name?: string; type?: string } = {},
) {
  return new File(bytes, options.name || "context.pdf", {
    type: options.type || "application/pdf",
  });
}

describe("Concept Note Builder wiring helpers", () => {
  it("accepts a PDF with the expected metadata and signature", async () => {
    await expect(validateConceptNoteSourceFile(pdfFile())).resolves.toBeNull();
  });

  it("accepts Markdown with a supported extension and MIME type", async () => {
    await expect(
      validateConceptNoteSourceFile(
        new File(["# Plan"], "context.md", { type: "text/markdown" }),
      ),
    ).resolves.toBeNull();
  });

  it("rejects an invalid signature even when the MIME type is PDF", async () => {
    await expect(
      validateConceptNoteSourceFile(pdfFile(["not a pdf"])),
    ).resolves.toBe("invalid-pdf-signature");
  });

  it("rejects a source over the public upload limit", async () => {
    const oversized = pdfFile([], { name: "large.pdf" });
    Object.defineProperty(oversized, "size", {
      value: CONCEPT_NOTE_SOURCE_MAX_BYTES + 1,
    });

    await expect(validateConceptNoteSourceFile(oversized)).resolves.toBe(
      "oversized-source-file",
    );
  });

  it("rejects invalid Markdown encoding and content", async () => {
    await expect(
      validateConceptNoteSourceFile(
        new File([new Uint8Array([0xff, 0xfe, 0x61])], "context.md", {
          type: "text/markdown",
        }),
      ),
    ).resolves.toBe("invalid-markdown-utf8");

    await expect(
      validateConceptNoteSourceFile(
        new File(["  \n"], "context.md", { type: "text/plain" }),
      ),
    ).resolves.toBe("empty-markdown-source");

    await expect(
      validateConceptNoteSourceFile(
        new File([new Uint8Array([0x23, 0x00, 0x20])], "context.md", {
          type: "text/x-markdown",
        }),
      ),
    ).resolves.toBe("invalid-markdown-source");
  });

  it("formats visible file and status metadata", () => {
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0 MiB");
    expect(conceptNoteSourceLabel("context.md")).toBe("context");
    expect(uploadStatusTranslationKey("processing")).toBe("status-converting");
    expect(uploadStatusTranslationKey("ready")).toBe("status-ready");
  });

  it("polls only while conversion can still advance", () => {
    expect(shouldPollConceptNoteUpload("queued")).toBe(true);
    expect(shouldPollConceptNoteUpload("processing")).toBe(true);
    expect(shouldPollConceptNoteUpload("ready")).toBe(false);
    expect(shouldPollConceptNoteUpload("failed")).toBe(false);
  });

  it("reads the camelCase CityCatalyst upload identity", () => {
    expect(
      requireConceptNoteUploadIdentity({
        uploadId: "11111111-1111-4111-8111-111111111111",
        status: "queued",
      }),
    ).toEqual({
      uploadId: "11111111-1111-4111-8111-111111111111",
      status: "queued",
    });
    expect(() => requireConceptNoteUploadIdentity({})).toThrow(
      "durable identity",
    );
  });
});
