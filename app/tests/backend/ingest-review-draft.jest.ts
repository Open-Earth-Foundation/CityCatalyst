import { describe, expect, it } from "@jest/globals";
import { IngestRunner } from "@/backend/ingest/IngestRunner";
import { MemoryIngestStore } from "@/backend/ingest/MemoryIngestStore";
import { MemoryIngestDocumentPool } from "@/backend/ingest/document-pool";
import { TestIngestPlugin } from "@/backend/ingest/plugins/TestIngestPlugin";
import { REVIEW_LOCK_MS } from "@/backend/ingest/review-draft";
import { IngestItemError } from "@/backend/ingest/types";

const CITY_ID = "53f808c2-c218-4d79-a3d8-ff4d3afc8aee";
const INVENTORY_ID = "a3e1c0a0-1111-4b11-8c11-aaaaaaaaaaaa";
const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

class ReviewPlugin extends TestIngestPlugin {
  commitCount = 0;

  approvalPolicy(): "review" {
    return "review";
  }

  async commit(
    ctx: Parameters<TestIngestPlugin["commit"]>[0],
    adapted: unknown,
  ) {
    this.commitCount += 1;
    return super.commit(ctx, adapted);
  }
}

function harness() {
  const store = new MemoryIngestStore();
  const plugin = new ReviewPlugin();
  const runner = new IngestRunner(store, new MemoryIngestDocumentPool());
  return { store, plugin, runner };
}

async function awaitingItem() {
  const { store, plugin, runner } = harness();
  const job = await runner.enqueue({
    moduleId: "test",
    scope: { cityId: CITY_ID, inventoryId: INVENTORY_ID },
    files: [{ name: "notes.csv", buffer: Buffer.from("hello city\n") }],
  });
  await runner.run(job.id, plugin);
  const [item] = await store.listItems(job.id);
  if (!item) throw new Error("missing item");
  return { store, plugin, runner, item };
}

describe("Ingest review drafts (CC-956)", () => {
  it("stores a versioned envelope at awaiting_review without committing", async () => {
    const { plugin, item } = await awaitingItem();

    expect(item.status).toBe("awaiting_review");
    expect(plugin.commitCount).toBe(0);
    expect(item.reviewDraftVersion).toBe(1);
    expect(item.reviewDraft?.sourceContentHash).toBe(item.contentHash);
    expect(item.reviewDraft?.targetBinding).toEqual({
      cityId: CITY_ID,
      inventoryId: INVENTORY_ID,
    });
    expect(item.reviewDraft?.payload).toEqual({ text: "hello city\n" });
    expect(item.reviewDraft?.decision.status).toBe("pending");
  });

  it("GET resumes the same payload and locks the editor", async () => {
    const { runner, item } = await awaitingItem();
    const first = await runner.getReviewDraft(item.id, USER_A);
    const again = await runner.getReviewDraft(item.id, USER_A);

    expect(first.draft.payload).toEqual({ text: "hello city\n" });
    expect(first.readOnly).toBe(false);
    expect(again.editorUserId).toBe(USER_A);
  });

  it("lets another collaborator read while the lock is held", async () => {
    const { runner, item } = await awaitingItem();
    await runner.getReviewDraft(item.id, USER_A);
    const other = await runner.getReviewDraft(item.id, USER_B);

    expect(other.readOnly).toBe(true);
    expect(other.editorUserId).toBe(USER_A);
    await expect(
      runner.saveReviewDraft(item.id, USER_B, {
        payload: { text: "nope" },
        reviewDraftVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "review_locked" });
  });

  it("steals an expired lock", async () => {
    const { store, runner, item } = await awaitingItem();
    await runner.getReviewDraft(item.id, USER_A);
    await store.updateItem(item.id, {
      reviewLockedAt: new Date(Date.now() - REVIEW_LOCK_MS - 1000),
    });
    const stolen = await runner.getReviewDraft(item.id, USER_B);

    expect(stolen.readOnly).toBe(false);
    expect(stolen.editorUserId).toBe(USER_B);
  });

  it("confirms the stored bundle without re-parsing and is idempotent", async () => {
    const { plugin, runner, item } = await awaitingItem();
    const completed = await runner.confirmReview(item.id, plugin, {
      userId: USER_A,
      reviewDraftVersion: 1,
    });
    const again = await runner.confirmReview(item.id, plugin, {
      userId: USER_A,
      reviewDraftVersion: 1,
    });

    expect(completed.status).toBe("completed");
    expect(completed.result).toMatchObject({
      committed: true,
      preview: "hello city",
    });
    expect(again.status).toBe("completed");
    expect(plugin.commitCount).toBe(1);
  });

  it("rejects confirm when the source hash, version, or target changes", async () => {
    const { store, plugin, runner, item } = await awaitingItem();

    await expect(
      runner.confirmReview(item.id, plugin, {
        userId: USER_A,
        reviewDraftVersion: 99,
      }),
    ).rejects.toBeInstanceOf(IngestItemError);

    await store.updateItem(item.id, { contentHash: "a".repeat(64) });
    await expect(
      runner.confirmReview(item.id, plugin, {
        userId: USER_A,
        reviewDraftVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "stale_review_draft" });

    const retargeted = await awaitingItem();
    await retargeted.store.updateItem(retargeted.item.id, {
      targetInventoryId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    });
    await expect(
      retargeted.runner.confirmReview(retargeted.item.id, retargeted.plugin, {
        userId: USER_A,
        reviewDraftVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "stale_review_draft" });
  });

  it("PATCH increments version; confirm of the old version is stale", async () => {
    const { plugin, runner, item } = await awaitingItem();
    const saved = await runner.saveReviewDraft(item.id, USER_A, {
      payload: { text: "mapped rows" },
      reviewDraftVersion: 1,
    });

    expect(saved.version).toBe(2);
    await expect(
      runner.confirmReview(item.id, plugin, {
        userId: USER_A,
        reviewDraftVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "stale_review_draft" });

    const completed = await runner.confirmReview(item.id, plugin, {
      userId: USER_A,
      reviewDraftVersion: 2,
    });
    expect(completed.result).toMatchObject({ preview: "mapped rows" });
  });
});
