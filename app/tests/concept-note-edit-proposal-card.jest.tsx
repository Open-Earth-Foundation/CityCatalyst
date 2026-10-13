/** @jest-environment jsdom */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { act } from "react";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { createRoot, type Root } from "react-dom/client";
import type { EditProposal } from "@/util/concept-note-edit-types";

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { sources?: string }) =>
      values?.sources ? `${key}: ${values.sources}` : key,
  }),
}));

let EditProposalCard: typeof import("@/components/ConceptNoteWorkspace/edit-proposal-card").EditProposalCard;
let container: HTMLDivElement;
let root: Root;

const proposal: EditProposal = {
  proposal_id: "proposal-1",
  run_id: "run-1",
  instruction: "Add the data about the population please",
  scope: { kind: "auto" },
  status: "proposed",
  base_revisions: { "chapter-1": 1 },
  changes: [
    {
      change_id: "change-1",
      chapter_id: "chapter-1",
      chapter_title: "City context",
      base_revision: 1,
      start: 0,
      before: "Kraków is a large city.",
      after: "Kraków has 1,000,000 residents (2025).",
      kind: "factual",
      group_id: "population",
      source_refs: [],
      user_input_quote: null,
      context_refs: ["city"],
      source_snapshots: [],
      context_snapshots: [
        {
          section: "city",
          label: "CityCatalyst city profile",
          sha256: "a".repeat(64),
        },
      ],
    },
  ],
  clarification: null,
  error_code: null,
  result: null,
  created_at: "2026-09-24T10:00:00Z",
  updated_at: "2026-09-24T10:00:00Z",
};

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom lacks ResizeObserver, which the popover positioning uses.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  ({ EditProposalCard } =
    await import("@/components/ConceptNoteWorkspace/edit-proposal-card"));
});

afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("EditProposalCard", () => {
  it("names CityCatalyst data as the evidence for a context-backed edit", async () => {
    await act(async () =>
      root.render(
        <ChakraProvider value={defaultSystem}>
          <EditProposalCard
            proposal={proposal}
            lng="en"
            busy={false}
            onApply={async () => {}}
            onReject={async () => {}}
            onNavigate={() => {}}
          />
        </ChakraProvider>,
      ),
    );
    // CityCatalyst data is evidence, so the unverified-user-facts notice stays hidden.
    expect(
      document.querySelector('[data-testid="concept-note-user-facts-notice"]'),
    ).toBeNull();

    await act(async () => {
      document
        .querySelector<HTMLButtonElement>(
          '[data-testid="concept-note-edit-options"]',
        )!
        .click();
    });
    expect(
      document.querySelector(
        '[data-testid="concept-note-edit-context-sources"]',
      )?.textContent,
    ).toBe("edit-context-sources: edit-context-city");
  });
});
