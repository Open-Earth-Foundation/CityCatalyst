import { expect, it } from "@jest/globals";
import { prepareChatMarkdown } from "@/components/ConceptNoteWorkspace/chat-markdown-utils";
import { readReasoningPreview } from "@/components/ConceptNoteWorkspace/chat-utils";

it("shows actual partial model prose without waiting for a complete heading", () => {
  expect(readReasoningPreview("I need to compare the")).toBe(
    "I need to compare the",
  );
  expect(readReasoningPreview("**Calculating")).toBe("Calculating");
  expect(
    readReasoningPreview(
      "**Calculating payments**\n\nChecking values.\n\n**Comparing",
    ),
  ).toBe("Comparing");
  expect(readReasoningPreview("**Heading**\n\nThe annual payment is")).toBe(
    "The annual payment is",
  );
});

it("renders model math delimiters without changing code or currency", () => {
  expect(prepareChatMarkdown(String.raw`Cost $100. Inline \(r=0.06\).`)).toBe(
    "Cost $100. Inline $$r=0.06$$.",
  );
  expect(
    prepareChatMarkdown(String.raw`Formula: \[\frac{r}{1-(1+r)^{-25}}\]`),
  ).toBe("Formula: \n\n$$\n\\frac{r}{1-(1+r)^{-25}}\n$$\n\n");
  const code = "`\\(x\\)`\n```tex\n\\[x\\]\n```";
  expect(prepareChatMarkdown(code)).toBe(code);
});

it("buffers incomplete streaming formulas and preserves malformed completed text", () => {
  const incomplete = String.raw`Payment: \[\frac{100}{`;
  expect(prepareChatMarkdown(incomplete, true)).toBe("Payment: ");
  expect(prepareChatMarkdown(incomplete, false)).toBe(incomplete);
  expect(prepareChatMarkdown("Payment: $$x", true)).toBe("Payment: ");
  expect(prepareChatMarkdown("Payment: $$x$$", true)).toBe("Payment: $$x$$");
});
