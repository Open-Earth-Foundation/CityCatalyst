/** @jest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import {
  PdfSourceMetadataForm,
  draftToSourceMetadata,
  initialPdfSourceMetadataDraft,
  type PdfSourceMetadataDraft,
} from "@/components/steps/GHGI/import/pdf-source-metadata-form";
import en from "@/i18n/locales/en/onboarding.json";

const originalStructuredClone = globalThis.structuredClone;
beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no CSS.escape, which the zag radio group calls.
  (globalThis as any).CSS ??= { escape: (v: string) => v };
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.structuredClone = originalStructuredClone;
});

const t = ((key: string, opts?: Record<string, unknown>) => {
  const template = (en as Record<string, string>)[key] ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts?.[k] ?? ""));
}) as never;

let latest: PdfSourceMetadataDraft;

function Harness({ countryCode }: { countryCode: string | null }) {
  const [draft, setDraft] = useState(() =>
    initialPdfSourceMetadataDraft(countryCode),
  );
  latest = draft;
  return (
    <PdfSourceMetadataForm
      t={t}
      countryCode={countryCode}
      value={draft}
      onChange={setDraft}
    />
  );
}

async function render(countryCode: string | null) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <ChakraProvider value={defaultSystem}>
        <Harness countryCode={countryCode} />
      </ChakraProvider>,
    ),
  );
  return container;
}

const radio = (c: HTMLElement, value: string) =>
  c.querySelector(`input[type="radio"][value="${value}"]`) as HTMLInputElement;

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("PdfSourceMetadataForm", () => {
  it("defaults from country", async () => {
    const br = await render("BR");
    expect(radio(br, "european").checked).toBe(true);
    const xx = await render("XX");
    expect(radio(xx, "unknown").checked).toBe(true);
  });

  it("draft source tracking", async () => {
    const c = await render("BR");
    expect(draftToSourceMetadata(latest).metadata).toMatchObject({
      numberFormat: "european",
      numberFormatSource: "country_default",
    });
    await act(async () => radio(c, "english").click());
    expect(draftToSourceMetadata(latest).metadata).toMatchObject({
      numberFormat: "english",
      numberFormatSource: "user",
    });
  });

  it("clicking the preselected format confirms it as a user choice", async () => {
    const c = await render("BR");
    expect(draftToSourceMetadata(latest).metadata.numberFormatSource).toBe(
      "country_default",
    );
    await act(async () => radio(c, "european").click());
    expect(draftToSourceMetadata(latest).metadata).toMatchObject({
      numberFormat: "european",
      numberFormatSource: "user",
    });
  });

  it("european total with decimal comma", () => {
    const base = initialPdfSourceMetadataDraft("BR");
    const eu = draftToSourceMetadata({ ...base, totalText: "9.559.215,5" });
    expect(eu.metadata.reportedTotal).toBe(9559215.5);
    expect(eu.metadata.reportedTotalKind).toBe("gross");
    const en_ = draftToSourceMetadata({
      ...base,
      numberFormat: "english",
      totalText: "9.559.215,5",
    });
    expect(en_.errors).toContain("total");
  });

  it("preview shows tCO2e", async () => {
    const c = await render("BR");
    const input = c.querySelector(
      "input[inputmode='decimal']",
    ) as HTMLInputElement;
    await act(async () => setInput(input, "7.453.000"));
    expect(c.textContent).toContain("= 7,453,000 tCO2e");
  });

  it("invalid pages block extract", () => {
    const base = initialPdfSourceMetadataDraft("BR");
    expect(
      draftToSourceMetadata({ ...base, pagesText: "55-40" }).errors,
    ).toEqual(["pages"]);
    expect(
      draftToSourceMetadata({ ...base, pagesText: "40-45, 52" }).metadata.pages,
    ).toEqual([40, 41, 42, 43, 44, 45, 52]);
  });

  it("empty draft gives all-null metadata", () => {
    const { metadata, errors } = draftToSourceMetadata({
      ...initialPdfSourceMetadataDraft("XX"),
    });
    expect(errors).toEqual([]);
    expect(metadata).toEqual({
      numberFormat: null,
      numberFormatSource: null,
      reportedTotal: null,
      reportedTotalKind: null,
      pages: null,
    });
  });
});
