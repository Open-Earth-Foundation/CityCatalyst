import JSZip from "jszip";
import { INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES } from "@/backend/inventory-import-file-limits";
import {
  UnpackArchiveError,
  isUnsafeZipPath,
  unpackArchive,
  type UnpackedArchive,
  type UnpackedArchiveEntry,
} from "@/backend/ingest/unpack-archive";

/** Enough for 380+ Chilean eCRF files with headroom. */
export const BULK_INVENTORY_IMPORT_MAX_FILES = 500;
export const BULK_INVENTORY_IMPORT_MAX_ZIP_BYTES = 2 * 1024 * 1024 * 1024;

export type BulkInventoryImportZipReject = UnpackArchiveError["code"];

export class BulkInventoryImportZipError extends Error {
  constructor(readonly code: BulkInventoryImportZipReject) {
    super(code);
    this.name = "BulkInventoryImportZipError";
  }
}

export type BulkInventoryImportZipEntry = UnpackedArchiveEntry;
export type UnpackedBulkInventoryImportZip = UnpackedArchive;

export { isUnsafeZipPath };

/**
 * Unpack a bulk-import zip. GHGI-specific size caps; Core unpack lives in ingest.
 */
export async function unpackBulkInventoryImportZip(
  buffer: Buffer,
  originalFileName: string,
  options?: {
    maxFiles?: number;
    maxZipBytes?: number;
    maxInnerFileBytes?: number;
  },
): Promise<UnpackedBulkInventoryImportZip> {
  try {
    return await unpackArchive(buffer, originalFileName, {
      maxFiles: options?.maxFiles ?? BULK_INVENTORY_IMPORT_MAX_FILES,
      maxZipBytes: options?.maxZipBytes ?? BULK_INVENTORY_IMPORT_MAX_ZIP_BYTES,
      maxInnerFileBytes:
        options?.maxInnerFileBytes ?? INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES,
    });
  } catch (err) {
    if (err instanceof UnpackArchiveError) {
      throw new BulkInventoryImportZipError(err.code);
    }
    throw err;
  }
}

export async function createBulkInventoryImportZip(
  files: Record<string, string | Buffer>,
): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
  }
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}
