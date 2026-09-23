/**
 * Unit tests for shared GPC notation-key encoding helpers.
 */
import { describe, expect, it } from "@jest/globals";
import {
  isNotEstimated,
  isNotOccurring,
  isNotationKey,
  toCanonical,
  toNotationKeyLabelKey,
  toShort,
} from "@/util/notation-keys";

describe("notation-keys", () => {
  describe("toCanonical", () => {
    it.each([
      ["NO", "no-occurrance"],
      ["ne", "not-estimated"],
      ["C", "confidential-information"],
      ["IE", "included-elsewhere"],
      ["no-occurrance", "no-occurrance"],
      ["not-estimated", "not-estimated"],
      ["confidential-information", "confidential-information"],
      ["included-elsewhere", "included-elsewhere"],
      ["reason-NO", "no-occurrance"],
      ["reason-NE", "not-estimated"],
      ["reason-C", "confidential-information"],
      ["reason-IE", "included-elsewhere"],
      ["REASON-NE", "not-estimated"],
    ] as const)("maps %s → %s", (input, expected) => {
      expect(toCanonical(input)).toBe(expected);
    });

    it("returns null for unknown or empty input", () => {
      expect(toCanonical(null)).toBeNull();
      expect(toCanonical(undefined)).toBeNull();
      expect(toCanonical("")).toBeNull();
      expect(toCanonical("unknown")).toBeNull();
      expect(toCanonical("presented-elsewhere")).toBeNull();
    });
  });

  describe("toShort", () => {
    it("emits GPC letters for kebab and legacy spellings", () => {
      expect(toShort("not-estimated")).toBe("NE");
      expect(toShort("reason-NE")).toBe("NE");
      expect(toShort("confidential-information")).toBe("C");
      expect(toShort("reason-C")).toBe("C");
      expect(toShort("no-occurrance")).toBe("NO");
      expect(toShort("included-elsewhere")).toBe("IE");
    });

    it("does not turn confidential into CI", () => {
      expect(toShort("confidential-information")).toBe("C");
    });
  });

  describe("predicates", () => {
    it("detects NE/NO across spellings", () => {
      expect(isNotEstimated("reason-NE")).toBe(true);
      expect(isNotEstimated("not-estimated")).toBe(true);
      expect(isNotEstimated("NE")).toBe(true);
      expect(isNotOccurring("reason-NO")).toBe(true);
      expect(isNotOccurring("no-occurrance")).toBe(true);
      expect(isNotationKey("IE")).toBe(true);
      expect(isNotationKey("nope")).toBe(false);
    });
  });

  describe("label helpers", () => {
    it("builds activity-tab notation-key label keys", () => {
      expect(toNotationKeyLabelKey("reason-NE")).toBe("notation-key-NE");
      expect(toNotationKeyLabelKey("not-estimated")).toBe("notation-key-NE");
      expect(toNotationKeyLabelKey(undefined)).toBe("notation-key-NO");
    });
  });
});
