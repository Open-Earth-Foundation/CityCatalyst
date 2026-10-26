import {
  BulkInventoryImportZipError,
  unpackBulkInventoryImportZip,
} from "@/backend/BulkInventoryImportZip";
import { IngestItemError, type IngestFileInput } from "./types";

const ZIP_ERROR_MAP: Record<string, IngestItemError["code"]> = {
  not_zip: "not_zip",
  empty_zip: "empty_zip",
  too_many_files: "too_many_files",
  zip_too_large: "zip_too_large",
  file_too_large: "file_too_large",
  path_traversal: "path_traversal",
};

export async function expandIngestInputs(
  files: IngestFileInput[],
): Promise<IngestFileInput[]> {
  if (files.length === 0) {
    throw new IngestItemError("no_files");
  }

  const expanded: IngestFileInput[] = [];
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      expanded.push(file);
      continue;
    }
    try {
      const unpacked = await unpackBulkInventoryImportZip(
        file.buffer,
        file.name,
        { maxFiles: 50, maxZipBytes: 20 * 1024 * 1024 },
      );
      for (const entry of unpacked.entries) {
        expanded.push({ name: entry.basename, buffer: entry.buffer });
      }
    } catch (err) {
      if (err instanceof BulkInventoryImportZipError) {
        throw new IngestItemError(ZIP_ERROR_MAP[err.code] ?? "not_zip");
      }
      throw err;
    }
  }
  if (expanded.length === 0) {
    throw new IngestItemError("empty_zip");
  }
  return expanded;
}
