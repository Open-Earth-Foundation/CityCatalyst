export interface UploadedFileMetadata {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
  storageProvider: string;
  key?: string; // optional for S3-style providers
}

export interface UploadFile {
  filename: string;
  mimetype: string;
  size: number;
  buffer: Buffer; // TODO Consider switching this to a readable stream
}

export interface FileStorageProvider {
  upload(file: UploadFile): Promise<UploadedFileMetadata>;
}

export class FileUploadService {
  constructor(private storageProvider: FileStorageProvider) {}

  async uploadFile(file: UploadFile): Promise<UploadedFileMetadata> {
    return await this.storageProvider.upload(file);
  }
}
