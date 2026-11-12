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
  totalCO2e: 608,
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

  it("does not take a legend line as the document stating the row", () => {
    const [out] = verifyRowProvenance(
      [row({ gpcRefNo: "III.4.3", refSource: "document", totalCO2e: 6300 })],
      `III.4.3 Wastewater generated outside the city

| Wastewater Treatment & Discharge | 6,300 |`,
    );
    expect(out.refSource).toBe("inferred");
  });

  it("reads a stated reference with a formatted value on its line", () => {
    const [out] = verifyRowProvenance(
      [row({ gpcRefNo: "III.4.3", refSource: "document", totalCO2e: 1188394 })],
      "| III.4.3 | Wastewater | 1,188,394 |",
    );
    expect(out.refSource).toBe("document");
  });

  it("reads a stated reference with a notation key on its line", () => {
    const [out] = verifyRowProvenance(
      [
        row({
          gpcRefNo: "III.4.3",
          refSource: "document",
          totalCO2e: null,
          notationKey: "NE",
        }),
      ],
      "| III.4.3 | Wastewater | NE |",
    );
    expect(out.refSource).toBe("document");
  });

  it("looks only at the row's page when it is known", () => {
    const pages = `<!-- page: 1 -->
| III.4.3 | Wastewater | 608 |
<!-- page: 2 -->
| Wastewater | 608 |`;
    const onPage = (page: number) =>
      verifyRowProvenance(
        [row({ gpcRefNo: "III.4.3", refSource: "document", page })],
        pages,
      )[0].refSource;
    expect(onPage(1)).toBe("document");
    expect(onPage(2)).toBe("inferred");
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

  it("gives no label to a quote too short to check", () => {
    const [out] = verifyRowProvenance(
      [row({ gpcRefNo: "III.4.3", directionEvidence: "来自城外的废水" })],
      "来自城外的废水 608",
    );
    expect(out.directionEvidenceFound).toBeNull();
  });

  it("leaves the quote result empty when there is no quote", () => {
    const [out] = verifyRowProvenance([row({ gpcRefNo: "III.4.3" })], DOCUMENT);
    expect(out.directionEvidenceFound).toBeNull();
  });

  it("keeps a conflicting reference when a document claim fails so it can be reviewed", () => {
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
    expect(out.gpcRefNo).toBe("III.1.2");
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

describe("verifyRowProvenance with regex metacharacters", () => {
  it("does not throw or match loosely on a reference with regex characters", () => {
    for (const gpcRefNo of ["III.4.3(", "III\\4", "III.4.3|1", "I.*"]) {
      const [out] = verifyRowProvenance(
        [row({ gpcRefNo, refSource: "document" })],
        DOCUMENT,
      );
      expect(out.refSource).toBe("inferred");
    }
  });

  it("does not throw on a notation key with regex characters", () => {
    const [out] = verifyRowProvenance(
      [
        row({
          gpcRefNo: "III.4.3",
          refSource: "document",
          totalCO2e: null,
          notationKey: "N(" as ExtractedRow["notationKey"],
        }),
      ],
      "| III.4.3 | NO |",
    );
    expect(out.refSource).toBe("inferred");
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

describe("verifyRowProvenance activity class rules", () => {
  it("moves a td_losses row to I.6.3 when the table line has no scope", () => {
    const [out] = verifyRowProvenance(
      [
        row({
          sector: "Stationary Energy",
          subsector: "Energy Industries",
          category: "Electricity T&D Losses",
          totalCO2e: 1710,
          gpcRefNo: "I.4.3",
          refSource: "inferred",
          activityClass: "td_losses",
        }),
      ],
      `Scope 1, Scope 2 and Scope 3 emissions are reported in this inventory.
| Electricity T&D Losses | 1,710 |`,
    );
    expect(out.gpcRefNo).toBe("I.6.3");
    expect(out.scope).toBe("3");
  });
});
