import { api } from "./api";
import type {
  DocumentWorkspace,
  DocumentPointCommand,
  DocumentPointCommandResult,
  DocumentPointQuestion,
} from "@/util/document-workspace";
import type { ConceptNoteUploadResponse } from "@/util/types";

export interface WorkspaceExportSnapshot {
  mode: "working" | "final";
  workspace_revision: number;
  export_id: string;
  body_markdown: string;
  caveats: string[];
}

export const documentWorkspaceApi = api
  .enhanceEndpoints({
    addTagTypes: ["DocumentWorkspace"],
  })
  .injectEndpoints({
    endpoints: (builder) => ({
      getDocumentWorkspace: builder.query<DocumentWorkspace, string>({
        query: (runId) => `concept-notes/${runId}/workspace`,
        providesTags: (_result, _error, id) => [
          { type: "DocumentWorkspace", id },
        ],
      }),
      saveDocumentSetup: builder.mutation<
        DocumentWorkspace,
        {
          runId: string;
          expected_revision: number;
          idempotency_key: string;
          document_type?: "concept_note";
        }
      >({
        query: ({ runId, ...body }) => ({
          url: `concept-notes/${runId}/setup`,
          method: "PUT",
          body,
        }),
        invalidatesTags: (_result, _error, { runId }) => [
          { type: "DocumentWorkspace", id: runId },
        ],
      }),
      commandDocumentPoint: builder.mutation<
        DocumentPointCommandResult,
        {
          runId: string;
          pointKey: string;
          command: DocumentPointCommand;
        }
      >({
        query: ({ runId, pointKey, command }) => ({
          url: `concept-notes/${runId}/points/${encodeURIComponent(pointKey)}/commands`,
          method: "POST",
          body: command,
        }),
        invalidatesTags: (_result, _error, { runId }) => [
          { type: "DocumentWorkspace", id: runId },
          { type: "ConceptNoteDraft", id: runId },
        ],
      }),
      getDocumentPointQuestion: builder.mutation<
        DocumentPointQuestion,
        { runId: string; pointKey: string; language: string }
      >({
        query: ({ runId, pointKey, language }) => ({
          url: `concept-notes/${runId}/points/${encodeURIComponent(pointKey)}/question`,
          method: "POST",
          body: { language },
        }),
      }),
      exportDocumentWorkspace: builder.mutation<
        WorkspaceExportSnapshot,
        { runId: string; mode: "working" | "final"; expected_revision: number }
      >({
        query: ({ runId, ...body }) => ({
          url: `concept-notes/${runId}/exports`,
          method: "POST",
          body,
        }),
      }),
      getWorkspaceDocuments: builder.query<
        {
          data: {
            documentId: string;
            filename: string;
            sourceFormat: "pdf" | "markdown";
            markdownReady: boolean;
          }[];
          pagination: { limit: number; offset: number; hasMore: boolean };
        },
        { runId: string; offset: number }
      >({
        query: ({ runId, offset }) =>
          `concept-notes/${runId}/documents?limit=20&offset=${offset}`,
      }),
      attachWorkspaceDocument: builder.mutation<
        ConceptNoteUploadResponse,
        {
          runId: string;
          document_id: string;
          source_role: "reference" | "climate_action_plan";
        }
      >({
        query: ({ runId, ...body }) => ({
          url: `concept-notes/${runId}/documents`,
          method: "POST",
          body,
        }),
        invalidatesTags: (_result, _error, { runId }) => [
          { type: "DocumentWorkspace", id: runId },
          { type: "ConceptNoteRuns", id: runId },
        ],
      }),
    }),
  });
