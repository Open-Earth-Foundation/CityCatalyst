import JSZip from "jszip";
import { INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES } from "@/backend/inventory-import-file-limits";

/** Default inner-file cap matches the single-inventory upload limit. */
export const INGEST_DEFAULT_MAX_INNER_FILE_BYTES =
  INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES;
export const INGEST_DEFAULT_MAX_FILES = 50;
export const INGEST_DEFAULT_MAX_ZIP_BYTES = 20 * 1024 * 1024;

export type UnpackArchiveReject =
  | "not_zip"
  | "empty_zip"
  | "too_many_files"
  | "zip_too_large"
  | "file_too_large"
  | "path_traversal";

export class UnpackArchiveError extends Error {
  constructor(readonly code: UnpackArchiveReject) {
    super(code);
    this.name = "UnpackArchiveError";
  }
}

export interface UnpackedArchiveEntry {
  /** Path inside the zip, using forward slashes. */
  path: string;
  basename: string;
  buffer: Buffer;
}

export interface UnpackedArchive {
  entries: UnpackedArchiveEntry[];
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
 * Unpack a zip in memory. Core owns path-traversal / junk / size checks so
 * GHGI bulk and the ingest runner share one implementation.
 */
export async function unpackArchive(
  buffer: Buffer,
  originalFileName: string,
  options?: {
    maxFiles?: number;
    maxZipBytes?: number;
    maxInnerFileBytes?: number;
  },
): Promise<UnpackedArchive> {
  const maxFiles = options?.maxFiles ?? INGEST_DEFAULT_MAX_FILES;
  const maxZipBytes = options?.maxZipBytes ?? INGEST_DEFAULT_MAX_ZIP_BYTES;
  const maxInnerFileBytes =
    options?.maxInnerFileBytes ?? INGEST_DEFAULT_MAX_INNER_FILE_BYTES;

  if (buffer.length > maxZipBytes) {
    throw new UnpackArchiveError("zip_too_large");
  }
  if (!looksLikeZip(originalFileName, buffer)) {
    throw new UnpackArchiveError("not_zip");
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new UnpackArchiveError("not_zip");
  }

  const candidatePaths: string[] = [];
  let manifestPath: string | null = null;

  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const path = name.replace(/\\/g, "/");
    if (isJunkPath(path)) continue;
    if (isUnsafeZipPath(path)) {
      throw new UnpackArchiveError("path_traversal");
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
    throw new UnpackArchiveError("empty_zip");
  }
  if (candidatePaths.length > maxFiles) {
    throw new UnpackArchiveError("too_many_files");
  }

  const entries: UnpackedArchiveEntry[] = [];
  for (const path of candidatePaths) {
    const file = zip.file(path);
    if (!file) continue;
    const inner = Buffer.from(await file.async("uint8array"));
    if (inner.length > maxInnerFileBytes) {
      throw new UnpackArchiveError("file_too_large");
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
