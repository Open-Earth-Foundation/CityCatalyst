/** Real PostgreSQL migration, uniqueness and durable-pool regressions in an isolated schema. */
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { Sequelize, UniqueConstraintError } from "sequelize";
import { IngestDocument } from "@/models/IngestDocument";
import { NativeInputCatalog } from "@/models/NativeInputCatalog";

const url = process.env.INGEST_POOL_TEST_DATABASE_URL;
const models: {
  IngestDocument?: typeof IngestDocument;
  NativeInputCatalog?: typeof NativeInputCatalog;
} = {};
jest.unstable_mockModule("@/models", () => ({ db: { models } }));
jest.unstable_mockModule("@/backend/ConceptNoteUploadService", () => ({
  loadConceptNoteUpload: async () => {
    throw new Error("Direct source validation must not call CA transport");
  },
}));
jest.unstable_mockModule("@/backend/permissions/PermissionService", () => ({
  PermissionService: {
    canAccessCity: async () => ({ userRole: "COLLABORATOR" }),
  },
}));
const require = createRequire(import.meta.url);
const migration = require("../migrations/20261115150000-isolate-private-ingest-documents.cjs");
const integration = url ? describe : describe.skip;
const schema = `cc_private_pool_${randomUUID().replaceAll("-", "")}`;
const cityId = randomUUID();
const firstActor = randomUUID();
const secondActor = randomUUID();
const legacyPrivateId = randomUUID();
const legacyPublicId = randomUUID();
let sequelize: Sequelize;
let createdSchema = false;
let pool: InstanceType<
  typeof import("@/backend/ingest/IngestDocumentPoolService").SequelizeIngestDocumentPool
>;
let registerUpload: typeof import("@/backend/ingest/cnb-path-b").registerConceptNoteOnDocumentPool;
let assertManage: typeof import("@/backend/ingest/access").assertCanManageIngestDocument;
let assertSource: typeof import("@/backend/document-workspace-sources").assertReusedDocumentSourceAvailable;

integration("private document identity on real PostgreSQL", () => {
  beforeAll(async () => {
    const target = new URL(url!);
    if (
      !["localhost", "127.0.0.1"].includes(target.hostname) ||
      !/^cc_private_pool_[a-f0-9]+$/.test(schema)
    ) {
      throw new Error(
        "This regression requires an explicitly configured localhost test database",
      );
    }
    sequelize = new Sequelize(url!, {
      logging: false,
      schema,
      pool: { max: 1, min: 0 },
    });
    await sequelize.authenticate();
    await sequelize.query(`CREATE SCHEMA "${schema}"`);
    createdSchema = true;
    await sequelize.query(`SET search_path TO "${schema}", public`);
    await sequelize.query(`CREATE TABLE "IngestDocument" (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content_hash varchar(64) NOT NULL,
      original_file_name varchar(512) NOT NULL, city_id uuid, project_id uuid, organization_id uuid,
      uploaded_by_user_id uuid, visibility varchar(16) NOT NULL, markdown_ready boolean NOT NULL DEFAULT false,
      catalog_id uuid, s3_key text, data bytea, withdrawn_at timestamptz, bytes_purged_at timestamptz,
      created timestamptz NOT NULL DEFAULT now(), last_updated timestamptz NOT NULL DEFAULT now()
    ); CREATE UNIQUE INDEX "idx_ingest_document_hash_scope"
      ON "IngestDocument" (content_hash,city_id,project_id,organization_id)
      NULLS NOT DISTINCT WHERE withdrawn_at IS NULL;`);
    await sequelize.query(
      `INSERT INTO "IngestDocument"
      (id,content_hash,original_file_name,city_id,uploaded_by_user_id,visibility)
      VALUES (:privateId,:privateHash,'legacy-private.md',:city,:actor,'run'),
             (:publicId,:publicHash,'legacy-city.md',:city,:actor,'city')`,
      {
        replacements: {
          privateId: legacyPrivateId,
          publicId: legacyPublicId,
          privateHash: "a".repeat(64),
          publicHash: "b".repeat(64),
          city: cityId,
          actor: firstActor,
        },
      },
    );
    try {
      await migration.up(sequelize.getQueryInterface(), Sequelize);
    } catch (error) {
      const cause = error as {
        parent?: { message?: string };
        message?: string;
      };
      throw new Error(
        `Isolated migration failed: ${cause.parent?.message ?? cause.message}`,
      );
    }
    models.IngestDocument = IngestDocument.initModel(sequelize).schema(schema);
    models.NativeInputCatalog =
      NativeInputCatalog.initModel(sequelize).schema(schema);
    await models.NativeInputCatalog.sync();
    await sequelize.query(
      `CREATE UNIQUE INDEX "catalog_source_identity" ON "NativeInputCatalog" (source_type,source_id) WHERE availability <> 'withdrawn'`,
    );
    const { SequelizeIngestDocumentPool } =
      await import("@/backend/ingest/IngestDocumentPoolService");
    pool = new SequelizeIngestDocumentPool();
    ({ registerConceptNoteOnDocumentPool: registerUpload } =
      await import("@/backend/ingest/cnb-path-b"));
    ({ assertCanManageIngestDocument: assertManage } =
      await import("@/backend/ingest/access"));
    ({ assertReusedDocumentSourceAvailable: assertSource } =
      await import("@/backend/document-workspace-sources"));
  });

  afterAll(async () => {
    if (createdSchema) await sequelize.query(`DROP SCHEMA "${schema}" CASCADE`);
    await sequelize?.close();
  });

  it("backfills only private origins and retains public NULL identity", async () => {
    expect(
      (await models.IngestDocument!.findByPk(legacyPrivateId))?.privateOwnerId,
    ).toBe(firstActor);
    expect(
      (await models.IngestDocument!.findByPk(legacyPublicId))?.privateOwnerId,
    ).toBeNull();
  });

  it("isolates the same direct bytes by actor, enforces management, and preserves sharing", async () => {
    const buffer = Buffer.from(
      "# Identical private evidence\nRequested amount: EUR 250000.",
    );
    const common = {
      cityId,
      buffer,
      contentHash: createHash("sha256").update(buffer).digest("hex"),
      markdownReady: true,
    };
    const firstUpload = randomUUID();
    const secondUpload = randomUUID();
    const first = await registerUpload({
      ...common,
      uploadId: firstUpload,
      userId: firstActor,
      filename: "first-private.md",
    });
    const second = await registerUpload({
      ...common,
      uploadId: secondUpload,
      userId: secondActor,
      filename: "second-private.md",
    });
    expect(first.documentId).not.toBe(second.documentId);
    const firstDocument = (await pool.get(first.documentId))!;
    const secondDocument = (await pool.get(second.documentId))!;
    expect(firstDocument).toMatchObject({
      privateOwnerId: firstActor,
      uploadedByUserId: firstActor,
      visibility: "run",
      originalFileName: "first-private.md",
    });
    expect(secondDocument).toMatchObject({
      privateOwnerId: secondActor,
      uploadedByUserId: secondActor,
      visibility: "run",
      originalFileName: "second-private.md",
    });
    await expect(
      assertManage({ user: { id: secondActor } } as never, firstDocument),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      assertManage({ user: { id: secondActor } } as never, secondDocument),
    ).resolves.toBeUndefined();
    const secondAssociation = await models.NativeInputCatalog!.findOne({
      where: { sourceType: "cnb_upload", sourceId: secondUpload },
    });
    expect(secondAssociation?.userId).toBe(secondActor);
    expect(secondAssociation?.labels).toMatchObject({
      documentId: second.documentId,
      originalFileName: "second-private.md",
    });
    await expect(
      assertSource(firstUpload, { user: { id: firstActor } } as never),
    ).resolves.toBeUndefined();
    await expect(
      assertSource(secondUpload, { user: { id: secondActor } } as never),
    ).resolves.toBeUndefined();
    await expect(
      assertSource(firstUpload, { user: { id: secondActor } } as never),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(
      (
        await registerUpload({
          ...common,
          uploadId: secondUpload,
          userId: secondActor,
          filename: "second-private.md",
        })
      ).documentId,
    ).toBe(second.documentId);
    await pool.promoteToCity(second.documentId);
    expect(await pool.get(first.documentId)).toMatchObject({
      visibility: "run",
      privateOwnerId: firstActor,
    });
    expect(await pool.get(second.documentId)).toMatchObject({
      visibility: "city",
      privateOwnerId: secondActor,
    });
    const thirdActor = randomUUID();
    const thirdUpload = randomUUID();
    const shared = await registerUpload({
      ...common,
      uploadId: thirdUpload,
      userId: thirdActor,
      filename: "third-upload.md",
    });
    expect(shared.documentId).toBe(second.documentId);
    expect(
      (
        await models.NativeInputCatalog!.findOne({
          where: { sourceId: thirdUpload },
        })
      )?.userId,
    ).toBe(thirdActor);
    // A second publication of the same content must not change a replay's source.
    await pool.promoteToCity(first.documentId);
    expect(
      (
        await registerUpload({
          ...common,
          uploadId: thirdUpload,
          userId: thirdActor,
          filename: "third-upload.md",
        })
      ).documentId,
    ).toBe(second.documentId);
    await pool.withdraw(first.documentId);
    await expect(
      assertSource(firstUpload, { user: { id: firstActor } } as never),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      assertSource(secondUpload, { user: { id: secondActor } } as never),
    ).resolves.toBeUndefined();
    expect(await pool.get(second.documentId)).toMatchObject({
      availability: "active",
      visibility: "city",
    });
  });

  it("uses NULLS NOT DISTINCT for actual private/public conflicts and handles raced stores", async () => {
    const buffer = Buffer.from("# Racing private bytes");
    const input = {
      contentHash: createHash("sha256").update(buffer).digest("hex"),
      originalFileName: "race.md",
      buffer,
      scope: { cityId },
      uploadedByUserId: firstActor,
      visibility: "run" as const,
    };
    const results = await Promise.all(
      Array.from({ length: 6 }, () => pool.store(input)),
    );
    expect(new Set(results.map((result) => result.document.id)).size).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    await expect(
      models.IngestDocument!.create({
        contentHash: input.contentHash,
        originalFileName: "duplicate.md",
        cityId,
        projectId: null,
        organizationId: null,
        uploadedByUserId: firstActor,
        privateOwnerId: firstActor,
        visibility: "run",
      }),
    ).rejects.toBeInstanceOf(UniqueConstraintError);
    const publicRow = (await models.IngestDocument!.findByPk(legacyPublicId))!;
    await expect(
      models.IngestDocument!.create({
        contentHash: publicRow.contentHash,
        originalFileName: "public-duplicate.md",
        cityId,
        privateOwnerId: null,
        visibility: "city",
      }),
    ).rejects.toBeInstanceOf(UniqueConstraintError);
  });

  it("repairs a pre-isolation wrong actor association only on a full authorized replay", async () => {
    const buffer = Buffer.from("# Historical duplicated private bytes");
    const common = {
      cityId,
      buffer,
      contentHash: createHash("sha256").update(buffer).digest("hex"),
      markdownReady: true,
    };
    const first = await registerUpload({
      ...common,
      uploadId: randomUUID(),
      userId: firstActor,
      filename: "first.md",
    });
    const secondUpload = randomUUID();
    await models.NativeInputCatalog!.create({
      kind: "cnb_upload",
      owningModule: "cnb",
      sourceType: "cnb_upload",
      sourceId: secondUpload,
      userId: firstActor,
      cityId,
      contentDigest: common.contentHash,
      labels: { documentId: first.documentId, visibility: "run" },
    });
    const repaired = await registerUpload({
      ...common,
      uploadId: secondUpload,
      userId: secondActor,
      filename: "second.md",
    });
    expect(repaired.documentId).not.toBe(first.documentId);
    const association = await models.NativeInputCatalog!.findOne({
      where: { sourceId: secondUpload },
    });
    expect(association?.userId).toBe(secondActor);
    expect(association?.labels?.documentId).toBe(repaired.documentId);
    expect(await pool.get(first.documentId)).toMatchObject({
      visibility: "run",
      uploadedByUserId: firstActor,
    });
  });

  it("refuses a destructive downgrade while independent active private origins exist", async () => {
    await expect(
      migration.down(sequelize.getQueryInterface()),
    ).rejects.toBeInstanceOf(UniqueConstraintError);
    expect(
      (await models.IngestDocument!.findByPk(legacyPrivateId))?.privateOwnerId,
    ).toBe(firstActor);
  });
});
