import { beforeAll, describe, expect, it, jest } from "@jest/globals";

jest.unstable_mockModule("@/backend/UserService", () => ({
  default: {
    findUserInventory: jest
      .fn<() => Promise<Record<string, never>>>()
      .mockResolvedValue({}),
  },
}));
jest.unstable_mockModule("@/backend/FileValidatorService", () => ({
  default: {
    MAX_FILE_SIZE_MB: 20,
    validateFile: jest.fn(() => ({
      isValid: true,
      fileType: "pdf",
      fileSize: 100,
      errors: [],
      warnings: [],
    })),
  },
}));
jest.unstable_mockModule("@/backend/FileParserService", () => ({
  default: {},
}));
jest.unstable_mockModule("@/backend/ECRFImportService", () => ({
  default: {},
}));
jest.unstable_mockModule("@/backend/FormatAdapterService", () => ({
  default: {},
}));
jest.unstable_mockModule("@/backend/InventoryFileStorageService", () => ({
  default: { mimeTypeForFileType: jest.fn(() => "application/pdf") },
  isS3Configured: () => false,
}));
jest.unstable_mockModule("@/models", () => ({
  db: { models: { ImportedInventoryFile: {} } },
}));
jest.unstable_mockModule("@/util/api", () => ({
  apiHandler: (handler: unknown) => handler,
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

let uploadHandler: typeof import("@/app/api/v1/city/[city]/inventory/[inventory]/import/route").POST;
beforeAll(async () => {
  ({ POST: uploadHandler } = await import(
    "@/app/api/v1/city/[city]/inventory/[inventory]/import/route"
  ));
});

describe("PDF upload storage requirement", () => {
  it("returns a configuration error when S3 is unavailable", async () => {
    const file = { name: "inventory.pdf" };
    const request = {
      formData: async () => ({
        get: (key: string) => (key === "file" ? file : null),
      }),
    };
    await expect(
      uploadHandler(request, {
        session: { user: { id: "user-id" } },
        params: {
          city: "11111111-1111-4111-8111-111111111111",
          inventory: "22222222-2222-4222-8222-222222222222",
        },
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
