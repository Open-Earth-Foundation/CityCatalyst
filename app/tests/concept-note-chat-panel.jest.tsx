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
import { ChakraProvider } from "@chakra-ui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import translations from "@/i18n/locales/en/concept-notes.json";
import { appTheme } from "@/lib/theme/recipes/app-theme";
import type { ConceptNoteContextState } from "@/components/ConceptNoteWorkspace/context-status";

import { getConceptNoteContextPresentation } from "@/components/ConceptNoteWorkspace/context-status";
import { getConceptNoteBundleProgress } from "@/components/ConceptNoteDashboard/utils";

const startStream = jest.fn(async () => undefined);
const stopStream = jest.fn();
const openContext = jest.fn();
const originalFetch = globalThis.fetch;
const t = (key: string, options?: Record<string, unknown>) => {
  let text: string = translations[key as keyof typeof translations] ?? key;
  for (const [name, value] of Object.entries(options ?? {}))
    text = text.replace(`{{${name}}}`, String(value));
  return text;
};
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t }),
}));
jest.unstable_mockModule("@/hooks/useSSEStream", () => ({
  useSSEStream: () => ({ startStream, stopStream }),
}));

let Panel: typeof import("@/components/ConceptNoteWorkspace/chat-panel").ConceptNoteChatPanel;
let DraftPanel: typeof import("@/components/ConceptNoteWorkspace/draft-setup-panel").DraftSetupPanel;
let root: Root;
let container: HTMLDivElement;
const composerRequest = { id: "draft", content: "Use my uploaded PDF" };

async function renderPanel(contextState: ConceptNoteContextState) {
  await act(async () => {
    root.render(
      <ChakraProvider value={appTheme}>
        <Panel
          contextStatus={getConceptNoteContextPresentation(
            contextState,
            getConceptNoteBundleProgress({}),
            t as never,
          )}
          composerRequest={composerRequest}
          lng="en"
          onOpenContext={openContext}
          threadId="thread-1"
        />
      </ChakraProvider>,
    );
  });
  await act(async () => {
    await new Promise(requestAnimationFrame);
  });
}

function input() {
  return container.querySelector("input")!;
}
function send() {
  return container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
}

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ messages: [] }),
  })) as unknown as typeof fetch;
  ({ DraftSetupPanel: DraftPanel } =
    await import("@/components/ConceptNoteWorkspace/draft-setup-panel"));
  ({ ConceptNoteChatPanel: Panel } =
    await import("@/components/ConceptNoteWorkspace/chat-panel"));
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
afterAll(() => {
  globalThis.fetch = originalFetch;
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

describe("Concept Note processing chat gate", () => {
  it.each<ConceptNoteContextState>([
    "uploading",
    "processing",
    "preparing",
    "failed",
  ])("blocks clicks and form submission during %s", async (state) => {
    await renderPanel(state);
    expect(input().disabled).toBe(true);
    expect(send().disabled).toBe(true);
    expect(container.textContent).not.toContain(
      t("clima-no-uploaded-evidence-message"),
    );
    await act(async () => {
      send().click();
      container
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
    expect(startStream).not.toHaveBeenCalled();
    expect(input().value).toBe(composerRequest.content);
  });

  it("unlocks after processing, preserves a drafted message, and sends it once", async () => {
    await renderPanel("processing");
    expect(container.textContent).toContain(
      t("clima-context-processing-title"),
    );
    await renderPanel("ready");
    expect(input().disabled).toBe(false);
    expect(send().disabled).toBe(false);
    expect(container.textContent).toContain(t("clima-context-ready-message"));
    await act(async () => send().click());
    expect(startStream).toHaveBeenCalledTimes(1);
    expect(startStream).toHaveBeenCalledWith(
      "/api/v1/chat/messages",
      expect.objectContaining({
        body: JSON.stringify({
          threadId: "thread-1",
          content: composerRequest.content,
        }),
      }),
    );
  });

  it("allows city-only chat and blocks it again when another upload starts", async () => {
    await renderPanel("none");
    expect(input().disabled).toBe(false);
    await renderPanel("uploading");
    expect(input().disabled).toBe(true);
    expect(send().disabled).toBe(true);
  });

  it("keeps failure recovery accessible while chat is blocked", async () => {
    await renderPanel("failed");
    expect(container.textContent).toContain(t("clima-context-failed-message"));
    const review = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === t("review-context"),
    )!;
    await act(async () => review.click());
    expect(openContext).toHaveBeenCalledTimes(1);
  });
});

describe("shared chat and draft context status", () => {
  it.each<ConceptNoteContextState>(["processing", "failed", "ready"])(
    "shows the same %s state in both panels and exposes analysis errors",
    async (state) => {
      const bundle = getConceptNoteBundleProgress({
        context_bundle: {
          status: state === "processing" ? "ready" : state,
          document_grounding: state === "ready" ? "uploaded_evidence" : "none",
          retryable: true,
          error_code: "incomplete_source_coverage",
          error_reason: "reader_section_count_mismatch",
        },
      });
      const contextStatus = getConceptNoteContextPresentation(
        state,
        bundle,
        t as never,
      );
      await act(async () =>
        root.render(
          <ChakraProvider value={appTheme}>
            <Panel
              contextStatus={contextStatus}
              composerRequest={null}
              lng="en"
              onOpenContext={openContext}
              threadId="thread-1"
            />
            <DraftPanel
              contextStatus={contextStatus}
              bundle={bundle}
              applicationContext={null}
              applicationContextFailed={false}
              applicationContextLoading={false}
              canStartDrafting={false}
              draft={null}
              draftError={null}
              isDraftRunning={false}
              isRetrying={false}
              isStartingDraft={false}
              lng="en"
              onOpenContext={openContext}
              onRetry={openContext}
              onStartDrafting={openContext}
            />
          </ChakraProvider>,
        ),
      );
      expect(container.textContent?.split(contextStatus.title)).toHaveLength(3);
      expect(
        container.textContent?.split(contextStatus.description),
      ).toHaveLength(3);
      expect(container.textContent).not.toContain(t("uploaded-evidence-none"));
      expect(input().disabled).toBe(state !== "ready");
      if (state === "failed") {
        expect(container.textContent).toContain("incomplete_source_coverage");
        expect(container.textContent).toContain(
          "some sections could not be analyzed",
        );
        const retry = Array.from(container.querySelectorAll("button")).find(
          (button) => button.textContent?.includes(t("retry-context")),
        )!;
        await act(async () => retry.click());
        expect(openContext).toHaveBeenCalled();
      }
    },
  );
});
