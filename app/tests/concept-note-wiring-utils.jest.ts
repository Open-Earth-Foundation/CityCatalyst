import { describe, expect, it } from "@jest/globals";

import {
  CONCEPT_NOTE_PDF_MAX_BYTES,
  formatFileSize,
  requireConceptNoteUploadIdentity,
  uploadStatusLabel,
  validateConceptNotePdf,
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
    await expect(validateConceptNotePdf(pdfFile())).resolves.toBeNull();
  });

  it("rejects an invalid signature even when the MIME type is PDF", async () => {
    await expect(
      validateConceptNotePdf(pdfFile(["not a pdf"])),
    ).resolves.toMatch("valid PDF signature");
  });

  it("rejects a PDF over the public upload limit", async () => {
    const oversized = pdfFile([], { name: "large.pdf" });
    Object.defineProperty(oversized, "size", {
      value: CONCEPT_NOTE_PDF_MAX_BYTES + 1,
    });

    await expect(validateConceptNotePdf(oversized)).resolves.toMatch("20 MiB");
  });

  it("formats visible file and status metadata", () => {
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0 MiB");
    expect(uploadStatusLabel("processing")).toBe("Converting");
    expect(uploadStatusLabel("ready")).toBe("Ready");
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
