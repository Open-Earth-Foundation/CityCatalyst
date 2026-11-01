import { describe, expect, it } from "@jest/globals";
import {
  coarseKindsFromExtensions,
  detectCoarseFileKind,
} from "@/backend/ingest/coarse-kind";

describe("detectCoarseFileKind (CC-959)", () => {
  it.each([
    ["report.pdf", "pdf"],
    ["inventory.xlsx", "xlsx"],
    ["legacy.xls", "xlsx"],
    ["rows.csv", "csv"],
    ["notes.md", "md"],
    ["README.markdown", "md"],
    ["bundle.zip", "zip"],
    ["notes.txt", "unknown"],
    ["scan.exe", "unknown"],
    ["no-extension", "unknown"],
  ] as const)("maps %s to %s", (name, kind) => {
    expect(detectCoarseFileKind(name)).toBe(kind);
  });

  it("sniffs PDF magic when the name has no useful extension", () => {
    expect(detectCoarseFileKind("blob", Buffer.from("%PDF-1.4"))).toBe("pdf");
  });

  it("sniffs ZIP magic when the name has no useful extension", () => {
    expect(detectCoarseFileKind("blob", Buffer.from("PK\u0003\u0004"))).toBe(
      "zip",
    );
  });

  it("prefers the extension over ZIP magic so xlsx stays xlsx", () => {
    expect(
      detectCoarseFileKind("sheet.xlsx", Buffer.from("PK\u0003\u0004")),
    ).toBe("xlsx");
  });

  it("maps plugin allowedExtensions to coarse kinds", () => {
    expect(coarseKindsFromExtensions(["csv", "txt", "xlsx"])).toEqual([
      "csv",
      "xlsx",
    ]);
  });
});
