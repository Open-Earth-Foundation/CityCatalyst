import { describe, expect, it } from "@jest/globals";
import { configureStore } from "@reduxjs/toolkit";
import { api } from "@/services/api";
import type { ConceptNoteRun } from "@/util/types";

describe("concept note list cache", () => {
  it("refreshes the city list when a listed run changes", async () => {
    const store = configureStore({
      reducer: { [api.reducerPath]: api.reducer },
      middleware: (getDefault) => getDefault().concat(api.middleware),
    });
    try {
      await store.dispatch(
        api.util.upsertQueryData("getConceptNoteRuns", "city-1", {
          runs: [{ run_id: "run-1" } as ConceptNoteRun],
        }),
      );
      expect(
        api.util.selectInvalidatedBy(store.getState(), [
          { type: "ConceptNoteRuns", id: "run-1" },
        ]),
      ).toEqual([
        expect.objectContaining({
          endpointName: "getConceptNoteRuns",
          originalArgs: "city-1",
        }),
      ]);
      expect(
        api.util.selectInvalidatedBy(store.getState(), [
          { type: "ConceptNoteRuns", id: "unrelated-run" },
        ]),
      ).toEqual([]);
    } finally {
      store.dispatch(api.util.resetApiState());
    }
  });
});
