/**
 * CC-1201 amendment 3: the review shows what is known about a held row, and
 * never gives a verdict on what a quote means.
 */
import { describe, expect, it } from "@jest/globals";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import ImportReviewRows from "@/components/steps/GHGI/import/import-review-rows";
import type { ImportRowReview } from "@/util/types";

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key) as never;

const row: ImportRowReview = {
  rowIndex: 3,
  issue: "direction-unconfirmed",
  value: 6300,
  notationKey: null,
  suggestedRefNo: "III.4.3",
  chosenRefNo: "III.4.3",
  sector: "Waste",
  subsector: "Wastewater Treatment And Discharge",
  category: "Wastewater Treatment & Discharge",
  scope: "1",
  expectedScope: null,
  quote: null,
  quoteFound: null,
  page: null,
  source: null,
  decision: null,
  referenceOptions: ["III.4.1", "III.4.2", "III.4.3"],
};

function render(rows: ImportRowReview[]) {
  return renderToStaticMarkup(
    <ChakraProvider value={defaultSystem}>
      <ImportReviewRows t={t} rows={rows} onDecide={() => {}} />
    </ChakraProvider>,
  );
}

describe("ImportReviewRows", () => {
  it("shows the fields of a held row and says when there is no context", () => {
    const html = render([row]);
    expect(html).toContain("6300 tCO2e");
    expect(html).toContain("III.4.3");
    expect(html).toContain("Wastewater Treatment And Discharge");
    expect(html).toContain("Wastewater Treatment &amp; Discharge");
    expect(html).toContain("import-review-no-context");
    expect(html).toContain("import-review-keep");
    expect(html).toContain("import-review-skip");
    expect(html).toContain("III.4.1");
  });

  it("labels a quote as found, and gives no other verdict", () => {
    const html = render([
      {
        ...row,
        quote: "Efluentes gerados fora do município",
        quoteFound: true,
        page: 12,
        source: "Tabela 8",
      },
    ]);
    expect(html).toContain("Efluentes gerados fora do município");
    expect(html).toContain("import-review-quote-found");
    expect(html).not.toContain("import-review-no-context");
    expect(html).toContain("Tabela 8");
  });

  it("labels an invented quote as not found", () => {
    const html = render([{ ...row, quote: "Imported", quoteFound: false }]);
    expect(html).toContain("import-review-quote-not-found");
  });

  it("gives a quote too short to check a neutral label", () => {
    const html = render([
      { ...row, quote: "来自城外的废水", quoteFound: null },
    ]);
    expect(html).toContain("import-review-quote-unchecked");
    expect(html).not.toContain("import-review-quote-not-found");
  });

  it("shows the reference and the conflicting scope side by side", () => {
    const html = render([
      {
        ...row,
        issue: "reference-conflict",
        scope: "3",
        expectedScope: 1,
      },
    ]);
    expect(html).toContain("import-review-conflict");
    expect(html).toContain("&quot;stated&quot;:&quot;3&quot;");
  });

  it("renders nothing with no held rows", () => {
    expect(render([])).not.toContain("import-review-rows");
  });
});
