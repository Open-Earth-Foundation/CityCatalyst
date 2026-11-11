/**
 * CC-1201 amendment 3: the review shows what is known about a held row, and
 * never gives a verdict on what a quote means.
 */
import { describe, expect, it } from "@jest/globals";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import ImportReviewRows from "@/components/steps/GHGI/import/import-review-rows";
import type { TFunction } from "i18next";
import type { ImportRowReview } from "@/util/types";
import en from "@/i18n/locales/en/onboarding.json";

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
  activityType: null,
  scopeOrigin: "document",
  scope: "1",
  expectedScope: null,
  quote: null,
  quoteFound: null,
  page: null,
  source: null,
  decision: null,
  referenceOptions: ["III.4.1", "III.4.2", "III.4.3"],
};

// Resolves real English strings so the tests assert what the user reads.
const strings = en as Record<string, string>;
const realT = (lng: string) =>
  Object.assign(
    (key: string, values?: Record<string, unknown>) =>
      (strings[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name) =>
        String(values?.[name] ?? ""),
      ),
    { lng },
  ) as unknown as TFunction;

function render(rows: ImportRowReview[], translate: TFunction = t) {
  return renderToStaticMarkup(
    <ChakraProvider value={defaultSystem}>
      <ImportReviewRows
        t={translate}
        fileId="file-a"
        rows={rows}
        onDecide={() => {}}
      />
    </ChakraProvider>,
  );
}

describe("ImportReviewRows", () => {
  it("shows the fields of a held row and says when there is no context", () => {
    const html = render([row]);
    expect(html).toContain("6,300 tCO2e");
    expect(html).toContain("III.4.3");
    expect(html).toContain("Wastewater Treatment And Discharge");
    expect(html).toContain("Wastewater Treatment &amp; Discharge");
    expect(html).toContain("import-review-no-context");
    expect(html).toContain("import-review-keep");
    expect(html).toContain("import-review-skip");
    expect(html).toContain("III.4.1");
  });

  const content: ImportRowReview = {
    ...row,
    page: 4,
    category: "Electricity – Residential",
    sector: "Stationary energy",
    subsector: "Residential buildings",
    value: 16119,
    suggestedRefNo: "I.6.1",
    scope: "1",
    scopeOrigin: "document",
  };

  it("shows the row content before the decision buttons", () => {
    const html = render([content], realT("en"));
    for (const text of [
      "Page 4",
      "Electricity – Residential",
      "Stationary energy &gt; Residential buildings",
      "16,119 tCO2e",
      "I.6.1",
      "Scope 1 · From the document",
    ]) {
      expect(html).toContain(text);
    }
    expect(html.indexOf("Page 4")).toBeLessThan(
      html.indexOf("Keep this reference"),
    );
  });

  it("does not repeat the word Scope when the stated text already has it", () => {
    const html = render(
      [{ ...content, scope: "Scope 2", scopeOrigin: "document" }],
      realT("en"),
    );
    expect(html).toContain("Scope 2 · From the document");
    expect(html).not.toContain("Scope Scope");
  });

  it("shows the scope taken from the reference, not the stated text", () => {
    const html = render(
      [
        {
          ...content,
          scope: null,
          finalScope: "1",
          scopeOrigin: "reference",
        },
      ],
      realT("en"),
    );
    expect(html).toContain("Scope 1 · From GPC reference");
  });

  it("formats the value in the UI language, not the browser locale", () => {
    expect(render([content], realT("de"))).toContain("16.119 tCO2e");
  });

  it("falls back to activityType and — for a missing page", () => {
    const html = render(
      [{ ...content, page: null, category: null, activityType: "Gas use" }],
      realT("en"),
    );
    expect(html).toContain("Gas use");
    expect(html).toContain(">—<");
    expect(html).not.toContain("Page ");
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
    expect(html).toContain("import-review-change-scope");
  });

  it("renders nothing with no held rows", () => {
    expect(render([])).not.toContain("import-review-rows");
  });
});
