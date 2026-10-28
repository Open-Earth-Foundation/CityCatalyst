/**
 * One product limit shared by inventory upload and the PDF OCR worker.
 * The UI presents this as 20 MB; the byte boundary is 20 MiB.
 */
export const INVENTORY_IMPORT_MAX_FILE_SIZE_MB = 20;
export const INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES =
  INVENTORY_IMPORT_MAX_FILE_SIZE_MB * 1024 * 1024;
