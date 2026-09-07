import { api } from "./api";
import type {
  EditApplyRequest,
  EditProposal,
  EditProposalRequest,
} from "@/util/concept-note-edit-types";

type Target = { runId: string; proposalId: string };
const collection = (runId: string) =>
  `concept-notes/${encodeURIComponent(runId)}/edit-proposals`;
const target = ({ runId, proposalId }: Target) =>
  `${collection(runId)}/${encodeURIComponent(proposalId)}`;
const tags = (_result: unknown, _error: unknown, { runId }: Target) => [
  { type: "ConceptNoteEdits" as const, id: runId },
];

export const editApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listEditProposals: builder.query<EditProposal[], string>({
      query: collection,
      providesTags: (_result, _error, runId) => [
        { type: "ConceptNoteEdits", id: runId },
      ],
    }),
    getEditProposal: builder.query<EditProposal, Target>({ query: target }),
    applyEditProposal: builder.mutation<
      EditProposal,
      Target & { body: EditApplyRequest }
    >({
      query: (args) => ({
        url: `${target(args)}/apply`,
        method: "POST",
        body: args.body,
      }),
      invalidatesTags: tags,
    }),
    rejectEditProposal: builder.mutation<EditProposal, Target>({
      query: (args) => ({
        url: `${target(args)}/reject`,
        method: "POST",
        body: {},
      }),
      invalidatesTags: tags,
    }),
    refineEditProposal: builder.mutation<
      EditProposal,
      Target & { body: EditProposalRequest }
    >({
      query: (args) => ({
        url: `${target(args)}/refine`,
        method: "POST",
        body: args.body,
      }),
      invalidatesTags: tags,
    }),
  }),
});

/** Preserve safe machine-readable errors returned by the authorized proxy. */
export function editErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = error.data;
    if (
      data &&
      typeof data === "object" &&
      "code" in data &&
      typeof data.code === "string"
    )
      return data.code;
  }
  return "edit_request_failed";
}
