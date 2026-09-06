/** @jest-environment jsdom */
import { afterEach, beforeAll, expect, it, jest } from "@jest/globals";
import { createElement } from "react";
import type { Root } from "react-dom/client";
import { cleanup, mount, prepareDom, proposal, t } from "./cnb-edit-ui-helpers";

prepareDom();
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t }),
}));
let EditDiff: typeof import("@/components/ConceptNoteWorkspace/edit-diff").EditDiff;
let root: Root;
beforeAll(
  async () =>
    ({ EditDiff } =
      await import("@/components/ConceptNoteWorkspace/edit-diff")),
);
afterEach(async () => cleanup(root));

it("renders exact previous/proposed text with non-color removal/addition cues", async () => {
  const rendered = await mount(
    createElement(EditDiff, { lng: "en", change: proposal.changes[0] }),
    true,
  );
  root = rendered.root;
  expect(rendered.container.querySelector("del")?.textContent).toBe(
    proposal.changes[0].before,
  );
  expect(rendered.container.querySelector("ins")?.textContent).toBe(
    proposal.changes[0].after,
  );
  expect(
    rendered.container.querySelector("del")?.getAttribute("aria-label"),
  ).toBe("Previous text — removed");
  expect(
    rendered.container.querySelector("ins")?.getAttribute("aria-label"),
  ).toBe("Proposed text — added");
});
it("escapes untrusted document markup rather than executing it", async () => {
  const rendered = await mount(
    createElement(EditDiff, {
      lng: "en",
      inline: true,
      change: {
        ...proposal.changes[0],
        after: '<script>alert("unsafe")</script>',
      },
    }),
    true,
  );
  root = rendered.root;
  expect(rendered.container.querySelector("script")).toBeNull();
  expect(rendered.container.querySelector("del")?.textContent).toBe(
    proposal.changes[0].before,
  );
  expect(rendered.container.querySelector("ins")?.textContent).toContain(
    '<script>alert("unsafe")</script>',
  );
});
it("labels a deletion explicitly when proposed text is empty", async () => {
  const rendered = await mount(
    createElement(EditDiff, {
      lng: "en",
      change: { ...proposal.changes[0], after: "" },
    }),
    true,
  );
  root = rendered.root;
  expect(rendered.container.querySelector("ins")?.textContent).toBe(
    "Text removed",
  );
});
it("associates the diff with its affected chapter for assistive technology", async () => {
  const rendered = await mount(
    createElement(EditDiff, { lng: "en", change: proposal.changes[0] }),
    true,
  );
  root = rendered.root;
  expect(
    rendered.container
      .querySelector('[role="group"]')
      ?.getAttribute("aria-label"),
  ).toBe("Proposed change in Summary");
});
it("retains whitespace and complete long text without truncating the review", async () => {
  const text = "First paragraph\n\n  Indented text " + "review ".repeat(500);
  const rendered = await mount(
    createElement(EditDiff, {
      lng: "en",
      change: { ...proposal.changes[0], after: text },
      inline: true,
    }),
    true,
  );
  root = rendered.root;
  expect(rendered.container.querySelector("ins")?.textContent).toBe(text);
});

it("shows the complete previous and proposed sentences on separate rows", async () => {
  const before = "The total investment is €10 million in Kraków.";
  const after = "The total investment is €12 million in Kraków.";
  const onAccept = jest.fn();
  const onReject = jest.fn();
  const rendered = await mount(
    createElement(EditDiff, {
      lng: "en",
      inline: true,
      change: Object.freeze({ chapter_title: "Summary", before, after }),
      onAccept,
      onReject,
    }),
    true,
  );
  root = rendered.root;
  expect(rendered.container.querySelector("del")?.textContent).toBe(before);
  expect(rendered.container.querySelector("ins")?.textContent).toBe(after);
  expect(
    rendered.container.textContent?.match(/The total investment is/g),
  ).toHaveLength(2);
  expect(
    rendered.container.querySelector("del")?.parentElement?.nextElementSibling,
  ).toBe(rendered.container.querySelector("ins")?.parentElement);
  const reject = rendered.container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-inline-reject"]',
  )!;
  const accept = rendered.container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-inline-accept"]',
  )!;
  expect(reject.getAttribute("aria-label")).toBe("Reject this change");
  expect(accept.getAttribute("aria-label")).toBe("Accept this change");
  reject.click();
  accept.click();
  expect(onReject).toHaveBeenCalledTimes(1);
  expect(onAccept).toHaveBeenCalledTimes(1);
});

it("shows only one X and tick when an anchor contains multiple token substitutions", async () => {
  const rendered = await mount(
    createElement(EditDiff, {
      lng: "en",
      inline: true,
      change: {
        chapter_title: "Summary",
        before: "The project builds parks and improves access.",
        after: "The project creates parks and expands access.",
      },
      onAccept: jest.fn(),
      onReject: jest.fn(),
    }),
    true,
  );
  root = rendered.root;
  expect(
    rendered.container.querySelectorAll(
      '[data-testid="concept-note-inline-reject"]',
    ),
  ).toHaveLength(1);
  expect(
    rendered.container.querySelectorAll(
      '[data-testid="concept-note-inline-accept"]',
    ),
  ).toHaveLength(1);
});

it.each([
  ["", "New text"],
  ["Old text", ""],
])(
  "offers both decisions for a pure insertion or deletion",
  async (before, after) => {
    const rendered = await mount(
      createElement(EditDiff, {
        lng: "en",
        inline: true,
        change: { chapter_title: "Summary", before, after },
        onAccept: jest.fn(),
        onReject: jest.fn(),
      }),
      true,
    );
    root = rendered.root;
    expect(
      rendered.container.querySelector(
        '[data-testid="concept-note-inline-reject"]',
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        '[data-testid="concept-note-inline-accept"]',
      ),
    ).not.toBeNull();
  },
);

it("preserves exact before/after text in the rendered presentation without mutating the model change", async () => {
  const change = Object.freeze({
    chapter_title: "Summary",
    before: "🌳 The project builds parks for €10 million and improves access.",
    after: "🌳 The project creates parks for €12 million and expands access.",
  });
  const original = JSON.stringify(change);
  const rendered = await mount(
    createElement(EditDiff, { lng: "en", inline: true, change }),
    true,
  );
  root = rendered.root;
  expect(rendered.container.querySelector("del")?.textContent).toBe(
    change.before,
  );
  expect(rendered.container.querySelector("ins")?.textContent).toBe(
    change.after,
  );
  expect(JSON.stringify(change)).toBe(original);
});

it("keeps case-insensitive information markers atomic during presentation alignment", async () => {
  const rendered = await mount(
    createElement(EditDiff, {
      lng: "en",
      inline: true,
      change: {
        chapter_title: "Summary",
        before: "Existing budget.",
        after: "Existing [information needed: budget].",
      },
    }),
    true,
  );
  root = rendered.root;
  expect(rendered.container.textContent).not.toContain("[information needed:");
  expect(
    rendered.container.querySelector(
      'ins [aria-label="information needed: budget"]',
    ),
  ).not.toBeNull();
});

it("resolves the inline red/green semantic tokens to readable colors on the white document", async () => {
  const { appTheme } = await import("@/lib/theme/recipes/app-theme");
  for (const color of ["red", "green"]) {
    const token = appTheme.tokens.getByName(`colors.${color}.fg`)!;
    expect(token.extensions.conditions?._light).toBe(`{colors.${color}.700}`);
    const hex = appTheme.tokens.getByName(`colors.${color}.700`)!.value;
    const rgb = [1, 3, 5]
      .map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
      .map((value) =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
      );
    const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    expect(1.05 / (luminance + 0.05)).toBeGreaterThanOrEqual(4.5);
  }
});
