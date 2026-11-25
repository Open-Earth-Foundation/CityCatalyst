import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";
import { buildMistralOcrRequest } from "@/backend/MistralOcrService";
import { runPdfConversion } from "../scripts/benchmark-cnb-pdf";

describe("pinned PDF benchmark converter", () => {
  let directory: string;
  const pdf = Buffer.from(
    "%PDF-1.7\nsynthetic fixture for mocked conversion\n",
  );
  const digest = createHash("sha256").update(pdf).digest("hex");
  const signedUrl =
    "https://storage.example/source.pdf?signature=private-value";
  const previousEnv = { ...process.env };

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "cnb-pdf-benchmark-"));
    await writeFile(path.join(directory, "input.pdf"), pdf);
    process.env.MISTRAL_API_KEY = "private-provider-key";
    process.env.MISTRAL_OCR_MODEL = "requested-ocr";
    process.env.AWS_FILE_UPLOAD_S3_BUCKET_ID = "test-staging";
    jest.spyOn(InventoryFileStorageService, "putFile").mockResolvedValue();
    jest
      .spyOn(InventoryFileStorageService, "createSignedDownloadUrl")
      .mockResolvedValue(signedUrl);
    jest.spyOn(InventoryFileStorageService, "deleteFile").mockResolvedValue();
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "returned-ocr",
          document_url: signedUrl,
          api_key: "private-provider-key",
          pages: [
            {
              index: 0,
              markdown: "# Converted source",
              dimensions: { width: 100, height: 100 },
              blocks: [],
            },
          ],
        }),
        { status: 200 },
      ),
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    for (const key of [
      "MISTRAL_API_KEY",
      "MISTRAL_OCR_MODEL",
      "MISTRAL_OCR_TIMEOUT_MS",
      "AWS_FILE_UPLOAD_S3_BUCKET_ID",
    ]) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
    await rm(directory, { recursive: true, force: true });
  });

  const options = () => ({
    pdf: path.join(directory, "input.pdf"),
    expectedSha256: digest,
    outputDir: path.join(directory, "conversion"),
    timeoutMs: 1234,
  });

  it("uses production visual-context settings, pins bytes and removes its temporary object", async () => {
    const report = await runPdfConversion(options());
    expect(report.status).toBe("completed");
    expect(report.requested_model).toBe("requested-ocr");
    expect(report.returned_model).toBe("returned-ocr");
    expect(report.cleanup).toBe("completed");
    expect(report.cost).toEqual({ status: "unavailable", usd: null });
    const request = JSON.parse(
      jest.mocked(global.fetch).mock.calls[0][1]!.body as string,
    );
    expect(request).toEqual(
      buildMistralOcrRequest(signedUrl, "requested-ocr", "visual_context"),
    );
    const settings = { ...request };
    delete settings.document;
    expect(report.request_settings).toEqual(settings);
    const [key, uploadedBytes, contentType, signal] = jest.mocked(
      InventoryFileStorageService.putFile,
    ).mock.calls[0];
    expect(key).toMatch(/^benchmark\/cnb\/temporary\/[0-9a-f-]+\/source\.pdf$/);
    expect(uploadedBytes).toEqual(pdf);
    expect(contentType).toBe("application/pdf");
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(InventoryFileStorageService.deleteFile).toHaveBeenCalledWith(
      key,
      expect.any(AbortSignal),
    );
    for (const filename of [
      "conversion.json",
      "structured.json",
      "source.md",
    ]) {
      const content = await readFile(
        path.join(options().outputDir, filename),
        "utf8",
      );
      expect(content).not.toContain("private-value");
      expect(content).not.toContain("private-provider-key");
    }
  });

  it("records missing returned model as unknown instead of the requested alias", async () => {
    jest.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          pages: [
            {
              index: 0,
              markdown: "Source",
              dimensions: { width: 100, height: 100 },
              blocks: [],
            },
          ],
        }),
      ),
    );
    expect((await runPdfConversion(options())).returned_model).toBeNull();
  });

  it("redacts sensitive echoes from returned model provenance too", async () => {
    jest.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          model: `${signedUrl} private-provider-key`,
          pages: [
            {
              index: 0,
              markdown: "Source",
              dimensions: { width: 100, height: 100 },
              blocks: [],
            },
          ],
        }),
      ),
    );
    const report = await runPdfConversion(options());
    expect(report.status).toBe("completed");
    expect(report.returned_model).toBe("[redacted] [redacted]");
    expect(JSON.stringify(report)).not.toMatch(
      /private-value|private-provider-key/,
    );
  });

  it("rejects changed pinned bytes before uploading or calling OCR", async () => {
    const report = await runPdfConversion({
      ...options(),
      expectedSha256: "0".repeat(64),
    });
    expect(report.error?.code).toBe("pdf_digest_mismatch");
    expect(report.cleanup).toBe("not_needed");
    expect(InventoryFileStorageService.putFile).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each(["provider", "upload", "signing"])(
    "cleans up after %s failure without retaining raw errors",
    async (stage) => {
      const error = new Error(`failure ${signedUrl} private-provider-key`);
      if (stage === "provider")
        jest.mocked(global.fetch).mockRejectedValue(error);
      if (stage === "upload")
        jest
          .mocked(InventoryFileStorageService.putFile)
          .mockRejectedValue(error);
      if (stage === "signing")
        jest
          .mocked(InventoryFileStorageService.createSignedDownloadUrl)
          .mockRejectedValue(error);
      const report = await runPdfConversion(options());
      expect(report.status).toBe("failed");
      expect(report.cleanup).toBe("completed");
      expect(InventoryFileStorageService.deleteFile).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(report)).not.toMatch(
        /private-value|private-provider-key/,
      );
      expect(
        JSON.parse(
          await readFile(
            path.join(options().outputDir, "conversion.json"),
            "utf8",
          ),
        ),
      ).toEqual(report);
    },
  );

  it("surfaces failed cleanup and preserves the provider failure", async () => {
    jest
      .mocked(global.fetch)
      .mockRejectedValue(new Error("provider unavailable"));
    jest
      .mocked(InventoryFileStorageService.deleteFile)
      .mockRejectedValue(new Error("cleanup unavailable"));
    const report = await runPdfConversion(options());
    expect(report).toMatchObject({
      status: "failed",
      cleanup: "failed",
      error: { code: "mistral_network_error" },
    });
  });

  it("refuses to overwrite a completed conversion", async () => {
    await runPdfConversion(options());
    await expect(runPdfConversion(options())).rejects.toThrow();
    expect(InventoryFileStorageService.putFile).toHaveBeenCalledTimes(1);
  });
});
