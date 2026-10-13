import { describe, expect, it } from "@jest/globals";
import {
  BulkInventoryImportZipError,
  createBulkInventoryImportZip,
  isUnsafeZipPath,
  unpackBulkInventoryImportZip,
} from "@/backend/BulkInventoryImportZip";

describe("isUnsafeZipPath", () => {
  it("rejects parent-directory and absolute paths", () => {
    expect(isUnsafeZipPath("../secret.xlsx")).toBe(true);
    expect(isUnsafeZipPath("cities/../../etc/passwd")).toBe(true);
    expect(isUnsafeZipPath("/tmp/file.xlsx")).toBe(true);
    expect(isUnsafeZipPath("C:/Windows/file.xlsx")).toBe(true);
    expect(isUnsafeZipPath("folder/file.xlsx")).toBe(false);
  });
});

describe("unpackBulkInventoryImportZip", () => {
  it("reads inner xlsx/csv files and a root manifest", async () => {
    const zip = await createBulkInventoryImportZip({
      "CL-IQQ-2023.xlsx": "xlsx-bytes",
      "nested/city.csv": "a,b\n1,2",
      "manifest.csv": "filename,locode,year\nCL-IQQ-2023.xlsx,CL IQQ,2023\n",
      "__MACOSX/._junk": "ignore",
      ".DS_Store": "ignore",
    });
    const unpacked = await unpackBulkInventoryImportZip(zip, "pack.zip");
    expect(unpacked.entries.map((e) => e.basename).sort()).toEqual([
      "CL-IQQ-2023.xlsx",
      "city.csv",
    ]);
    expect(unpacked.manifestCsv).toContain("CL IQQ");
  });

  it("rejects a non-zip filename", async () => {
    await expect(
      unpackBulkInventoryImportZip(Buffer.from("not-a-zip"), "notes.xlsx"),
    ).rejects.toMatchObject({ code: "not_zip" });
  });

  it("rejects an empty zip", async () => {
    const zip = await createBulkInventoryImportZip({
      "__MACOSX/._junk": "ignore",
    });
    await expect(
      unpackBulkInventoryImportZip(zip, "empty.zip"),
    ).rejects.toBeInstanceOf(BulkInventoryImportZipError);
    await expect(
      unpackBulkInventoryImportZip(zip, "empty.zip"),
    ).rejects.toMatchObject({ code: "empty_zip" });
  });

  it("keeps nested folder paths", async () => {
    const zip = await createBulkInventoryImportZip({
      "cities/CL-IQQ-2023.xlsx": "ok",
    });
    const unpacked = await unpackBulkInventoryImportZip(zip, "nested.zip");
    expect(unpacked.entries[0].path).toBe("cities/CL-IQQ-2023.xlsx");
  });

  it("still flags raw traversal strings before they reach S3 keys", () => {
    expect(isUnsafeZipPath("foo/../../secret.xlsx")).toBe(true);
  });

  it("rejects inner files over the size cap", async () => {
    const zip = await createBulkInventoryImportZip({
      "huge.xlsx": Buffer.alloc(64),
    });
    await expect(
      unpackBulkInventoryImportZip(zip, "huge.zip", {
        maxInnerFileBytes: 32,
      }),
    ).rejects.toMatchObject({ code: "file_too_large" });
  });

  it("rejects more files than the documented max", async () => {
    const zip = await createBulkInventoryImportZip({
      "a.xlsx": "1",
      "b.xlsx": "2",
      "c.xlsx": "3",
    });
    await expect(
      unpackBulkInventoryImportZip(zip, "many.zip", { maxFiles: 2 }),
    ).rejects.toMatchObject({ code: "too_many_files" });
  });
});
