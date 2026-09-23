import { describe, expect, it } from "@jest/globals";
import { buildClimateAdvisorMessagePayload } from "@/backend/chat/message-payload";

describe("buildClimateAdvisorMessagePayload", () => {
  it("forwards inventory id, draft context, and options to Climate Advisor", () => {
    const payload = buildClimateAdvisorMessagePayload({
      userId: "user-1",
      accessToken: "fresh-token",
      body: {
        threadId: "thread-1",
        content: "Why did you choose this source?",
        inventory_id: "inventory-1",
        context: {
          stationary_energy_draft_run_id: "draft-1",
        },
        options: {
          stationary_energy_draft_run_id: "draft-1",
        },
      },
    });

    expect(payload).toEqual({
      thread_id: "thread-1",
      user_id: "user-1",
      content: "Why did you choose this source?",
      inventory_id: "inventory-1",
      context: {
        stationary_energy_draft_run_id: "draft-1",
        access_token: "fresh-token",
      },
      options: {
        stationary_energy_draft_run_id: "draft-1",
      },
    });
  });

  it("accepts the legacy inventoryId spelling", () => {
    const payload = buildClimateAdvisorMessagePayload({
      userId: "user-1",
      accessToken: "fresh-token",
      body: {
        threadId: "thread-1",
        content: "Hello",
        inventoryId: "inventory-legacy",
      },
    });

    expect(payload.inventory_id).toBe("inventory-legacy");
    expect(payload.context).toEqual({ access_token: "fresh-token" });
    expect(payload.options).toEqual({});
  });

  it("replaces client token aliases while preserving workflow context", () => {
    const payload = buildClimateAdvisorMessagePayload({
      userId: "user-1",
      accessToken: "server-issued-token",
      body: {
        threadId: "thread-1",
        content: "Validate the chapter",
        context: {
          access_token: "expired-token",
          cc_access_token: "client-supplied-token",
          concept_note_run_id: "run-1",
        },
      },
    });

    expect(payload.context).toEqual({
      concept_note_run_id: "run-1",
      access_token: "server-issued-token",
    });
  });
});
