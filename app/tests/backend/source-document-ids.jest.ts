import { describe, expect, it } from "@jest/globals";
import { IngestItemError } from "@/backend/ingest/types";
import {
  contributorDocumentIds,
  isAmbiguousImportedValue,
  withIncomingSourceDocument,
} from "@/backend/ingest/source-document-ids";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("source document contributors", () => {
  it("treats a single tagged row as exclusive", () => {
    expect(contributorDocumentIds({ sourceDocumentId: A })).toEqual([A]);
    expect(isAmbiguousImportedValue({ sourceDocumentId: A })).toBe(false);
  });

  it("appends a second file onto an accumulated GPC total", () => {
    const mixed = withIncomingSourceDocument({ sourceDocumentId: A }, B);
    expect(mixed.sourceDocumentIds).toEqual([A, B]);
    expect(mixed.sourceDocumentId).toBe(A);
    expect(isAmbiguousImportedValue(mixed)).toBe(true);
  });

  it("maps mixed provenance to a 409 ingest error code", () => {
    const error = new IngestItemError(
      "ambiguous_imported_data",
      "This document shares inventory values with another file. Delete-including-data cannot split an accumulated GPC total.",
    );
    expect(error.code).toBe("ambiguous_imported_data");
  });
});
