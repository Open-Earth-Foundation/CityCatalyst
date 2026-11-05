import { afterEach, describe, expect, it, jest } from "@jest/globals";
import JSZip from "jszip";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { IngestRunner } from "@/backend/ingest/IngestRunner";
import { MemoryIngestStore } from "@/backend/ingest/MemoryIngestStore";
import { MemoryIngestDocumentPool } from "@/backend/ingest/document-pool";
import { TestIngestPlugin } from "@/backend/ingest/plugins/TestIngestPlugin";
import { GhgiIngestPlugin } from "@/backend/ingest/plugins/GhgiIngestPlugin";
import { assertCanEnqueueIngest } from "@/backend/ingest/access";
import { createIngestPlugin } from "@/backend/ingest/registry";
import {
  filesFromIngestForm,
  parseIngestDryRun,
  parseIngestScope,
  publicIngestItem,
  startModuleIngest,
} from "@/backend/ingest/start";
import { INGEST_MODULES, IngestItemError } from "@/backend/ingest/types";
import { Roles } from "@/util/types";
import type { AppSession } from "@/lib/auth";

const CITY_ID = "53f808c2-c218-4d79-a3d8-ff4d3afc8aee";
const USER_A = "11111111-1111-1111-1111-111111111111";

function runtime() {
  const store = new MemoryIngestStore();
  const runner = new IngestRunner(store, new MemoryIngestDocumentPool());
  return { store, runner, plugin: new TestIngestPlugin() };
}

describe("HTTP module ingest enqueue (CC-1219)", () => {
  it("parses scope and dryRun from multipart fields", () => {
    const form = new FormData();
    form.append("cityId", CITY_ID);
    form.append("dryRun", "true");
    expect(parseIngestScope(form)).toEqual({
      inventoryId: undefined,
      cityId: CITY_ID,
      projectId: undefined,
      organizationId: undefined,
    });
    expect(parseIngestDryRun(form.get("dryRun"))).toBe(true);
  });

  it("runs a csv through the test plugin and registers Path B", async () => {
    const { store, runner, plugin } = runtime();
    const { job, items } = await startModuleIngest({
      moduleId: "test",
      files: [{ name: "notes.csv", buffer: Buffer.from("hello city\n") }],
      scope: { cityId: CITY_ID },
      userId: USER_A,
      runner,
      store,
      plugin,
    });
    expect(job.status).toBe("completed");
    expect(items[0]?.status).toBe("completed");
    expect(items[0]?.documentId).toBeTruthy();
    expect(publicIngestItem(items[0]!)).not.toHaveProperty("buffer");
  });

  it("expands a zip into one item per inner file", async () => {
    const zip = new JSZip();
    zip.file("a.csv", "alpha");
    zip.file("b.csv", "bravo");
    const buffer = Buffer.from(await zip.generateAsync({ type: "uint8array" }));
    const { store, runner, plugin } = runtime();
    const { job, items } = await startModuleIngest({
      moduleId: "test",
      files: [{ name: "bundle.zip", buffer }],
      scope: { cityId: CITY_ID },
      userId: USER_A,
      runner,
      store,
      plugin,
    });
    expect(job.completedCount).toBe(2);
    expect(items.map((item) => item.originalFileName).sort()).toEqual([
      "a.csv",
      "b.csv",
    ]);
  });

  it("skips commit and Path B on dryRun", async () => {
    const store = new MemoryIngestStore();
    const documentPool = new MemoryIngestDocumentPool();
    const runner = new IngestRunner(store, documentPool);
    const { items } = await startModuleIngest({
      moduleId: "test",
      files: [{ name: "notes.csv", buffer: Buffer.from("keep") }],
      scope: { cityId: CITY_ID },
      userId: USER_A,
      dryRun: true,
      runner,
      store,
      plugin: new TestIngestPlugin(),
    });
    expect(items[0]?.status).toBe("skipped");
    expect(items[0]?.errorCode).toBe("dry_run");
    expect(documentPool.documents.size).toBe(0);
  });

  it("registers Path B for a PDF then fails the item", async () => {
    const store = new MemoryIngestStore();
    const documentPool = new MemoryIngestDocumentPool();
    const runner = new IngestRunner(store, documentPool);
    const { items } = await startModuleIngest({
      moduleId: "test",
      files: [{ name: "scan.pdf", buffer: Buffer.from("%PDF-1.4") }],
      scope: { cityId: CITY_ID },
      userId: USER_A,
      runner,
      store,
      plugin: new TestIngestPlugin(),
    });
    expect(items[0]?.status).toBe("failed");
    expect(items[0]?.errorCode).toBe("unsupported_extension");
    expect(items[0]?.documentId).toBeTruthy();
    expect(documentPool.documents.size).toBe(1);
  });

  it("rejects enqueue without city/org/project scope", async () => {
    const { store, runner, plugin } = runtime();
    await expect(
      startModuleIngest({
        moduleId: "test",
        files: [{ name: "notes.csv", buffer: Buffer.from("x") }],
        scope: {},
        userId: USER_A,
        runner,
        store,
        plugin,
      }),
    ).rejects.toMatchObject({ code: "missing_scope" });
  });

  it("rejects a form with no file", async () => {
    await expect(filesFromIngestForm(new FormData())).rejects.toBeInstanceOf(
      IngestItemError,
    );
  });

  it("lists known modules but only ghgi and test have plugins", () => {
    expect(INGEST_MODULES).toEqual(
      expect.arrayContaining(["ghgi", "test", "cnb", "ccra"]),
    );
    expect(createIngestPlugin("ghgi")).toBeInstanceOf(GhgiIngestPlugin);
    expect(createIngestPlugin("test")).toBeInstanceOf(TestIngestPlugin);
    expect(() => createIngestPlugin("cnb")).toThrow(/No ingest plugin/);
    expect(() => createIngestPlugin("ccra")).toThrow(/No ingest plugin/);
  });
});

describe("HTTP ingest enqueue access (CC-1219)", () => {
  const session: AppSession = {
    user: { id: USER_A, role: Roles.User },
    expires: "1h",
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("rejects enqueue without city, project, or organization", async () => {
    await expect(assertCanEnqueueIngest(session, {})).rejects.toMatchObject({
      status: 400,
    });
  });

  it("checks city access when cityId is set", async () => {
    const spy = jest
      .spyOn(PermissionService, "canAccessCity")
      .mockResolvedValue({} as never);
    await assertCanEnqueueIngest(session, { cityId: CITY_ID });
    expect(spy).toHaveBeenCalledWith(session, CITY_ID);
  });

  it("checks inventory access when inventoryId is set", async () => {
    const spy = jest
      .spyOn(PermissionService, "canAccessInventory")
      .mockResolvedValue({} as never);
    await assertCanEnqueueIngest(session, {
      inventoryId: "a3e1c0a0-1111-4b11-8c11-aaaaaaaaaaaa",
    });
    expect(spy).toHaveBeenCalled();
  });
});
