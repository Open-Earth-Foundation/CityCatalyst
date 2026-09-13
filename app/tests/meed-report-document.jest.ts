import { describe, expect, it } from "@jest/globals";

import {
  toReportActionDocument,
  toReportDocument,
} from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/report/reportDocument";
import type { MeedPlanRouteReport } from "@/util/types/meed";

const report: MeedPlanRouteReport = {
  actionId: "c40_0012",
  languages: ["en", "es"],
  chapters: [
    {
      key: "context",
      title: { en: "City context", es: "Contexto" },
      markdown: { en: "English body", es: "Cuerpo en español" },
      limitations: { en: ["Estimate only"], es: ["Solo estimación"] },
    },
    {
      key: "delivery",
      title: { en: "Delivery" },
      markdown: { en: "How to deliver" },
    },
  ],
};

describe("report document", () => {
  it("resolves chapters into the requested language", () => {
    const doc = toReportActionDocument(report, "Bus rapid transit", "es")!;
    expect(doc.actionName).toBe("Bus rapid transit");
    expect(doc.sections[0]).toEqual({
      title: "Contexto",
      markdown: "Cuerpo en español",
      limitations: ["Solo estimación"],
    });
  });

  it("falls back to English rather than rendering a blank chapter", () => {
    const doc = toReportActionDocument(report, "Bus rapid transit", "pt")!;
    expect(doc.sections[0].title).toBe("City context");
    expect(doc.sections[1].markdown).toBe("How to deliver");
  });

  it("accepts flat strings as well as language maps", () => {
    // The contract note warns older responses returned flat text.
    const flat: MeedPlanRouteReport = {
      actionId: "a1",
      chapters: [{ key: "k", title: "Title", markdown: "Body" }],
    };
    const doc = toReportActionDocument(flat, "Action", "en")!;
    expect(doc.sections[0]).toEqual({
      title: "Title",
      markdown: "Body",
      limitations: [],
    });
  });

  it("drops a chapter with no body in any language", () => {
    const partial: MeedPlanRouteReport = {
      actionId: "a1",
      chapters: [
        { key: "empty", title: { en: "Heading" }, markdown: {} },
        { key: "real", title: { en: "Real" }, markdown: { en: "Body" } },
      ],
    };
    const doc = toReportActionDocument(partial, "Action", "en")!;
    // A heading over blank space reads as a generation failure.
    expect(doc.sections.map((s) => s.title)).toEqual(["Real"]);
  });

  it("returns null when nothing renderable came back", () => {
    expect(toReportActionDocument(null, "Action", "en")).toBeNull();
    expect(
      toReportActionDocument({ actionId: "a1", chapters: [] }, "A", "en"),
    ).toBeNull();
    expect(toReportActionDocument({ chapters: [] }, "A", "en")).toBeNull();
  });

  it("keeps the on-screen order and skips actions that failed", () => {
    const docs = toReportDocument(
      [
        { actionId: "a1", actionName: "First", report },
        { actionId: "a2", actionName: "Failed", report: null },
        { actionId: "a3", actionName: "Third", report },
      ],
      "en",
    );
    // A failed action drops out; the rest keep their selection order.
    expect(docs.map((d) => d.actionName)).toEqual(["First", "Third"]);
  });
});
