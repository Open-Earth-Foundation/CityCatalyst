import { expect, it } from "@jest/globals";
import { prepareChatMarkdown } from "@/components/ConceptNoteWorkspace/chat-markdown-utils";
import { readReasoningHeading } from "@/components/ConceptNoteWorkspace/chat-utils";

it("keeps the last complete reasoning heading while the next one streams", () => {
  expect(readReasoningHeading("**Calculating")).toBeNull();
  expect(
    readReasoningHeading(
      "**Calculating payments**\n\nChecking values.\n\n**Comparing",
    ),
  ).toBe("Calculating payments");
  expect(
    readReasoningHeading(
      "**Calculating payments**\n\n## Comparing costs\nDetails",
    ),
  ).toBe("Comparing costs");
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
