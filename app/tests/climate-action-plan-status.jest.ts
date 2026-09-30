import { describe, expect, it } from "@jest/globals";
import { getClimateActionPlanState } from "@/components/ConceptNoteDashboard/climate-action-plan-status";
import { getConceptNoteBundleProgress } from "@/components/ConceptNoteDashboard/utils";
import type { ConceptNoteUploadResponse } from "@/util/types";

const plan: ConceptNoteUploadResponse = {
  uploadId: "plan-1",
  sourceRole: "climate_action_plan",
  status: "ready",
};

function bundle(status: string, included: string[] = []) {
  return getConceptNoteBundleProgress({
    context_bundle: {
      status,
      document_grounding: "uploaded_evidence",
      source_counts: { ready: 1 },
      included_upload_ids: included,
    },
  });
}

describe("Climate Action Plan document state", () => {
  it("keeps ordinary new-note reference uploads distinct from a plan", () => {
    expect(
      getClimateActionPlanState(
        [{ ...plan, sourceRole: "reference" }],
        bundle("ready", [plan.uploadId]),
      ),
    ).toBeNull();
  });

  it("does not confuse another included PDF or a ready OCR count with this plan", () => {
    expect(
      getClimateActionPlanState([plan], bundle("ready", ["other-pdf"])),
    ).toBe("processing");
    expect(getClimateActionPlanState([plan], bundle("ready"))).toBe(
      "processing",
    );
  });

  it("reports inclusion only when the completed bundle holds the plan identity", () => {
    expect(
      getClimateActionPlanState([plan], bundle("building", [plan.uploadId])),
    ).toBe("processing");
    expect(
      getClimateActionPlanState([plan], bundle("ready", [plan.uploadId])),
    ).toBe("included");
  });

  it.each(["queued", "processing"] as const)(
    "reports %s uploads as processing",
    (status) => {
      expect(
        getClimateActionPlanState(
          [{ ...plan, status }],
          bundle("ready", [plan.uploadId]),
        ),
      ).toBe("processing");
    },
  );

  it("reports processing failures and supports the retry transition", () => {
    expect(
      getClimateActionPlanState(
        [{ ...plan, status: "failed" }],
        bundle("ready"),
      ),
    ).toBe("failed");
    expect(getClimateActionPlanState([plan], bundle("failed"))).toBe("failed");
    expect(
      getClimateActionPlanState(
        [{ ...plan, status: "queued" }],
        bundle("failed"),
      ),
    ).toBe("processing");
  });
});
