import JSZip from "jszip";
import { INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES } from "@/backend/inventory-import-file-limits";

/** Enough for 380+ Chilean eCRF files with headroom. */
export const BULK_INVENTORY_IMPORT_MAX_FILES = 500;
export const BULK_INVENTORY_IMPORT_MAX_ZIP_BYTES = 2 * 1024 * 1024 * 1024;

export type BulkInventoryImportZipReject =
  | "not_zip"
  | "empty_zip"
  | "too_many_files"
  | "zip_too_large"
  | "file_too_large"
  | "path_traversal";

export class BulkInventoryImportZipError extends Error {
  constructor(readonly code: BulkInventoryImportZipReject) {
    super(code);
    this.name = "BulkInventoryImportZipError";
  }
}

export interface BulkInventoryImportZipEntry {
  /** Path inside the zip, using forward slashes. */
  path: string;
  basename: string;
  buffer: Buffer;
}

export interface UnpackedBulkInventoryImportZip {
  entries: BulkInventoryImportZipEntry[];
  manifestCsv: string | null;
}

const JUNK_BASENAMES = new Set([".ds_store", "thumbs.db", "desktop.ini"]);

function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? filePath;
}

function isJunkPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  const name = basename(normalized).toLowerCase();
  if (JUNK_BASENAMES.has(name)) return true;
  if (normalized.split("/").some((part) => part === "__MACOSX")) return true;
  return false;
}

export function isUnsafeZipPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    return true;
  }
  if (normalized.includes("://")) return true;
  return normalized.split("/").some((part) => part === "..");
}

function looksLikeZip(fileName: string, buffer: Buffer): boolean {
  const lower = fileName.toLowerCase();
  if (!lower.endsWith(".zip")) return false;
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function isManifestPath(path: string): boolean {
  return basename(path).toLowerCase() === "manifest.csv";
}

/**
 * Unpack a bulk-import zip in memory. Rejects unsafe or oversized archives
 * before any job row is written.
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
  const maxFiles = options?.maxFiles ?? BULK_INVENTORY_IMPORT_MAX_FILES;
  const maxZipBytes =
    options?.maxZipBytes ?? BULK_INVENTORY_IMPORT_MAX_ZIP_BYTES;
  const maxInnerFileBytes =
    options?.maxInnerFileBytes ?? INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES;

  if (buffer.length > maxZipBytes) {
    throw new BulkInventoryImportZipError("zip_too_large");
  }
  if (!looksLikeZip(originalFileName, buffer)) {
    throw new BulkInventoryImportZipError("not_zip");
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new BulkInventoryImportZipError("not_zip");
  }

  const candidatePaths: string[] = [];
  let manifestPath: string | null = null;

  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const path = name.replace(/\\/g, "/");
    if (isJunkPath(path)) continue;
    if (isUnsafeZipPath(path)) {
      throw new BulkInventoryImportZipError("path_traversal");
    }
    if (isManifestPath(path)) {
      if (
        !manifestPath ||
        path.split("/").length < manifestPath.split("/").length
      ) {
        manifestPath = path;
      }
      continue;
    }
    candidatePaths.push(path);
  }

  if (candidatePaths.length === 0) {
    throw new BulkInventoryImportZipError("empty_zip");
  }
  if (candidatePaths.length > maxFiles) {
    throw new BulkInventoryImportZipError("too_many_files");
  }

  const entries: BulkInventoryImportZipEntry[] = [];
  for (const path of candidatePaths) {
    const file = zip.file(path);
    if (!file) continue;
    const inner = Buffer.from(await file.async("uint8array"));
    if (inner.length > maxInnerFileBytes) {
      throw new BulkInventoryImportZipError("file_too_large");
    }
    entries.push({
      path,
      basename: basename(path),
      buffer: inner,
    });
  }

  let manifestCsv: string | null = null;
  if (manifestPath) {
    const file = zip.file(manifestPath);
    if (file) {
      manifestCsv = await file.async("string");
    }
  }

  return { entries, manifestCsv };
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
