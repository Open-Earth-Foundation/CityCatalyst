import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { logger } from "@/services/logger";

// Reuses the shared file-upload bucket already provisioned across envs
// (citycatalyst-files / citycatalyst-files-prod) instead of a dedicated
// imports bucket, so no new infra or workflow secrets are required.
const BUCKET = process.env.AWS_FILE_UPLOAD_S3_BUCKET_ID;
const REGION = process.env.AWS_FILE_UPLOAD_REGION ?? "us-east-1";

function getS3Client(): S3Client {
  return new S3Client({ region: REGION });
}

/** Returns true when the S3 bucket is configured (production). Falls back to BYTEA in dev when false. */
export function isS3Configured(): boolean {
  return !!BUCKET;
}

function assertConfigured(): void {
  if (!BUCKET) {
    throw new Error(
      "AWS_FILE_UPLOAD_S3_BUCKET_ID environment variable is not set. " +
        "Configure it to enable S3-backed file storage for inventory imports.",
    );
  }
}

/**
 * Handles S3 storage for uploaded inventory import files.
 *
 * Key convention: imports/{cityId}/{inventoryId}/{fileName}
 * where fileName is already a UUID-prefixed sanitized name.
 *
 * Required env vars (shared with the generic file-upload service):
 *   AWS_FILE_UPLOAD_S3_BUCKET_ID  — S3 bucket name
 *   AWS_FILE_UPLOAD_REGION        — AWS region (default: us-east-1)
 */
export default class InventoryFileStorageService {
  /**
   * Upload a file buffer to S3 and return the object key.
   */
  static async uploadFile(
    buffer: Buffer,
    cityId: string,
    inventoryId: string,
    fileName: string,
    mimeType: string,
  ): Promise<string> {
    assertConfigured();

    const key = `imports/${cityId}/${inventoryId}/${fileName}`;
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: BUCKET!,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ServerSideEncryption: "AES256",
      }),
    );

    logger.debug({ key, bucket: BUCKET }, "Inventory file uploaded to S3");
    return key;
  }

  /**
   * Load an imported file from S3 or the legacy BYTEA column on ImportedInventoryFile.
   */
  static async resolveImportedFileBuffer(importedFile: {
    s3Key?: string | null;
    data?: Buffer | Uint8Array | null;
  }): Promise<Buffer | null> {
    if (importedFile.s3Key) {
      try {
        return await InventoryFileStorageService.getFileBuffer(importedFile.s3Key);
      } catch (err) {
        logger.error(
          { err, s3Key: importedFile.s3Key },
          "Failed to fetch imported file from S3",
        );
        return null;
      }
    }
    if (importedFile.data) {
      return Buffer.isBuffer(importedFile.data)
        ? importedFile.data
        : Buffer.from(importedFile.data);
    }
    return null;
  }

  /**
   * Download a file from S3 by key and return it as a Buffer.
   */
  static async getFileBuffer(s3Key: string): Promise<Buffer> {
    assertConfigured();

    const response = await getS3Client().send(
      new GetObjectCommand({ Bucket: BUCKET!, Key: s3Key }),
    );

    const stream = response.Body as Readable;
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  }

  /**
   * Delete a file from S3. Safe to call even if s3Key is empty.
   */
  static async deleteFile(s3Key: string): Promise<void> {
    if (!BUCKET || !s3Key) return;
    await getS3Client().send(
      new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key }),
    );
    logger.debug({ key: s3Key }, "Inventory file deleted from S3");
  }

  /**
   * Resolve the MIME type for known inventory file extensions.
   */
  static mimeTypeForFileType(fileType: "csv" | "xlsx" | "pdf"): string {
    switch (fileType) {
      case "xlsx":
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      case "pdf":
        return "application/pdf";
      default:
        return "text/csv";
    }
  }
}
