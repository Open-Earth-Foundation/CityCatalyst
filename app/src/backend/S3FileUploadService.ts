// services/upload/providers/S3FileStorageProvider.ts

import { S3Client, PutObjectCommand, S3ClientConfig } from "@aws-sdk/client-s3";
import {
  FileStorageProvider,
  UploadedFileMetadata,
  UploadFile,
} from "./FileUploadService";

export class S3FileStorageProvider implements FileStorageProvider {
  private s3: S3Client;

  constructor(
    private bucket: string,
    s3Config: ConstructorParameters<typeof S3Client>[0],
  ) {
    this.s3 = new S3Client(s3Config as S3ClientConfig);
  }

  async upload(file: UploadFile): Promise<UploadedFileMetadata> {
    const key = `${Date.now()}_${file.filename}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await this.s3.send(command);

    return {
      url: `https://${process.env.AWS_FILE_UPLOAD_S3_BUCKET_ID}.s3.${process.env.AWS_FILE_UPLOAD_REGION}.amazonaws.com/${key}`,
      filename: file.filename,
      mimetype: file.mimetype,
      size: file.size,
      storageProvider: "s3",
      key,
    };
  }
}
