/** @jest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import ImportReviewRows from "@/components/steps/GHGI/import/import-review-rows";
import type { ImportRowReview } from "@/util/types";

const originalStructuredClone = globalThis.structuredClone;
beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.structuredClone = originalStructuredClone;
});

describe("scope review interaction", () => {
  it("submits the original row identity and the user's selected scope", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const decide = jest.fn();
    const row: ImportRowReview = {
      rowIndex: 0,
      issue: "reference-conflict",
      value: 6300,
      notationKey: null,
      suggestedRefNo: "III.4.3",
      chosenRefNo: "III.4.3",
      sector: null,
      decisionToken: "token-a",
      subsector: null,
      category: null,
      scope: "Scope 3",
      expectedScope: 1,
      quote: null,
      quoteFound: null,
      page: null,
      source: null,
      decision: null,
      referenceOptions: ["III.4.1", "III.4.2", "III.4.3"],
    };
    await act(async () =>
      root.render(
        <ChakraProvider value={defaultSystem}>
          <ImportReviewRows
            t={((key: string) => key) as never}
            fileId="file-a"
            rows={[row]}
            onDecide={decide}
          />
        </ChakraProvider>,
      ),
    );
    const select = container.querySelector(
      '[aria-label="import-review-change-scope"]',
    ) as HTMLSelectElement;
    expect(select).not.toBeNull();
    await act(async () => {
      select.value = "1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(decide).toHaveBeenCalledWith(0, {
      decisionFileId: "file-a",
      decisionToken: "token-a",
      decisionRef: "III.4.3",
      decisionScope: "Scope 3",
      decisionValue: 6300,
      reviewDecision: "correct-scope",
      scope: "1",
    });
    await act(async () => root.unmount());
    container.remove();
  });

  it("submits the original row identity and the user's selected reference", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const decide = jest.fn();
    const row: ImportRowReview = {
      rowIndex: 2,
      issue: "reference-conflict",
      value: 6300,
      notationKey: null,
      suggestedRefNo: "III.4.3",
      chosenRefNo: "III.4.3",
      sector: null,
      decisionToken: "token-b",
      subsector: null,
      category: null,
      scope: "Scope 3",
      expectedScope: 1,
      quote: null,
      quoteFound: null,
      page: null,
      source: null,
      decision: null,
      referenceOptions: ["III.4.1", "III.4.2", "III.4.3"],
    };
    await act(async () =>
      root.render(
        <ChakraProvider value={defaultSystem}>
          <ImportReviewRows
            t={((key: string) => key) as never}
            fileId="file-b"
            rows={[row]}
            onDecide={decide}
          />
        </ChakraProvider>,
      ),
    );
    const select = container.querySelector(
      '[aria-label="import-review-reclassify"]',
    ) as HTMLSelectElement;
    expect(select).not.toBeNull();
    await act(async () => {
      select.value = "III.4.1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(decide).toHaveBeenCalledWith(2, {
      decisionFileId: "file-b",
      decisionToken: "token-b",
      decisionRef: "III.4.3",
      decisionScope: "Scope 3",
      decisionValue: 6300,
      reviewDecision: "reclassify",
      gpcRefNo: "III.4.1",
    });
    await act(async () => root.unmount());
    container.remove();
  });
});
