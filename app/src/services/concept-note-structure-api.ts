import { api } from "./api";
import type {
  StructureState,
  StructureChapter,
} from "@/util/concept-note-structure";

export const structureApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getConceptNoteStructure: builder.query<StructureState, string>({
      query: (runId) => `concept-notes/${runId}/structure`,
      providesTags: (_r, _e, runId) => [
        { type: "ConceptNoteDraft", id: runId },
      ],
    }),
    saveConceptNoteStructure: builder.mutation<
      StructureState,
      {
        runId: string;
        expected_fingerprint: string;
        chapters: StructureChapter[];
      }
    >({
      query: ({ runId, ...body }) => ({
        url: `concept-notes/${runId}/structure`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (result, _e, { runId }) =>
        result
          ? [
              { type: "ConceptNoteDraft", id: runId },
              { type: "ConceptNoteEdits", id: runId },
            ]
          : [],
    }),
  }),
});
