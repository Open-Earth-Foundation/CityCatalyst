import base from "./jest.config.ts";

/** Stable CNB feature boundary; Jest includes matching files even if unexecuted. */
export default {
  ...base,
  testMatch: ["<rootDir>/tests/concept-note-*.jest.ts"],
  collectCoverageFrom: [
    "src/components/ConceptNoteWorkspace/{*review*,edit-*,use-concept-note-*,draft-*,chat-panel,index,gap-interview,missing-information,concept-note-export}.{ts,tsx}",
    "src/{backend,services,util}/concept-note-edit*.ts",
    "src/util/concept-note-polling.ts",
    "src/app/api/v1/concept-notes/**/{edit-proposals,revisions}/**/*.ts",
    "src/app/api/v1/chat/messages/route.ts",
  ],
  coverageDirectory: "coverage/cnb-edits",
  coverageReporters: ["text", "json", "json-summary", "lcov"],
  coverageThreshold: { global: { lines: 80 } },
};
