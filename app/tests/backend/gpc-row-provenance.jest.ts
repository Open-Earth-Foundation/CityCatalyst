/**
 * CC-1201 amendment 3: what the extraction records about a reference. These
 * functions check text only. No model call runs here.
 */
import { describe, expect, it } from "@jest/globals";
import {
  canonicalGpcRefNo,
  type ExtractedRow,
  verifyRowProvenance,
} from "@/backend/InventoryExtractionService";

const row = (fields: Partial<ExtractedRow>): ExtractedRow => ({
  year: 2022,
  sector: "Waste",
  subsector: "Wastewater Treatment And Discharge",
  category: "Wastewater",
  totalCO2e: 6300,
  ...fields,
});

const DOCUMENT = `
## Tratamento de efluentes
Efluentes gerados fora do município e tratados na cidade
| III.4.3 | 608 |
`;

describe("verifyRowProvenance", () => {
  it("keeps a document claim when the reference is in the text", () => {
    const [out] = verifyRowProvenance(
      [row({ gpcRefNo: "III.4.3", refSource: "document" })],
      DOCUMENT,
    );
    expect(out.refSource).toBe("document");
  });

  it("treats a claim as inferred when the reference is not in the text", () => {
    const [out] = verifyRowProvenance(
      [row({ gpcRefNo: "III.1.3", refSource: "document" })],
      DOCUMENT,
    );
    expect(out.refSource).toBe("inferred");
    expect(out.gpcRefNo).toBe("III.1.3");
  });

  it("does not take III.4.3 from a longer number", () => {
    const [out] = verifyRowProvenance(
      [row({ gpcRefNo: "III.4.3", refSource: "document" })],
      "see III.4.30 and XIII.4.3",
    );
    expect(out.refSource).toBe("inferred");
  });

  it("marks a row with no claim as inferred", () => {
    const [out] = verifyRowProvenance([row({ gpcRefNo: "III.4.3" })], DOCUMENT);
    expect(out.refSource).toBe("inferred");
  });

  it("marks a quote found in a Portuguese table heading", () => {
    const [out] = verifyRowProvenance(
      [
        row({
          gpcRefNo: "III.4.3",
          directionEvidence: "Efluentes gerados fora do município",
        }),
      ],
      DOCUMENT,
    );
    expect(out.directionEvidenceFound).toBe(true);
  });

  it("marks an invented quote as not found", () => {
    const [out] = verifyRowProvenance(
      [
        row({
          gpcRefNo: "III.4.3",
          directionEvidence: "Wastewater imported from neighbouring cities",
        }),
      ],
      DOCUMENT,
    );
    expect(out.directionEvidenceFound).toBe(false);
  });

  it("does not count a very short quote as found", () => {
    const [out] = verifyRowProvenance(
      [row({ gpcRefNo: "III.4.3", directionEvidence: "fora" })],
      DOCUMENT,
    );
    expect(out.directionEvidenceFound).toBe(false);
  });

  it("leaves the quote result empty when there is no quote", () => {
    const [out] = verifyRowProvenance([row({ gpcRefNo: "III.4.3" })], DOCUMENT);
    expect(out.directionEvidenceFound).toBeNull();
  });

  it("applies the scope check when a document claim fails", () => {
    const [out] = verifyRowProvenance(
      [
        row({
          subsector: "Solid Waste Disposal",
          gpcRefNo: "III.1.2",
          refSource: "document",
          scope: "1",
        }),
      ],
      DOCUMENT,
    );
    expect(out.gpcRefNo).toBe("III.1.1");
    expect(out.refSource).toBe("inferred");
  });

  it("keeps a stated reference that disagrees with the scope", () => {
    const [out] = verifyRowProvenance(
      [row({ gpcRefNo: "III.4.3", refSource: "document", scope: "3" })],
      DOCUMENT,
    );
    expect(out.gpcRefNo).toBe("III.4.3");
    expect(out.refSource).toBe("document");
  });
});

describe("canonicalGpcRefNo", () => {
  it("keeps III.x.3 on a scope 3 row", () => {
    expect(canonicalGpcRefNo("III.1.3", "3")).toBe("III.1.3");
  });

  it("still drops other references that disagree with the scope", () => {
    expect(canonicalGpcRefNo("III.1.2", "1")).toBeNull();
  });
});
