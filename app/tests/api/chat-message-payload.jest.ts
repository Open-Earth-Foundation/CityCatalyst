import { describe, expect, it } from "@jest/globals";
import { buildClimateAdvisorMessagePayload } from "@/backend/chat/message-payload";

describe("buildClimateAdvisorMessagePayload", () => {
  it("forwards inventory id, draft context, and options to Climate Advisor", () => {
    const payload = buildClimateAdvisorMessagePayload({
      userId: "user-1",
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
      },
      options: {
        stationary_energy_draft_run_id: "draft-1",
      },
    });
  });

  it("accepts the legacy inventoryId spelling", () => {
    const payload = buildClimateAdvisorMessagePayload({
      userId: "user-1",
      body: {
        threadId: "thread-1",
        content: "Hello",
        inventoryId: "inventory-legacy",
      },
    });

    expect(payload.inventory_id).toBe("inventory-legacy");
    expect(payload.options).toEqual({});
  });
});
