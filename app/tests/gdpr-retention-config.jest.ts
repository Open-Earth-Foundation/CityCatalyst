import { describe, expect, it } from "@jest/globals";
import { cutoffDate, readRetentionConfig } from "@/util/gdpr/retention-config";

describe("retention config", () => {
  it("uses the documented defaults when variables are unset", () => {
    const config = readRetentionConfig({});
    expect(config).toEqual({
      enabled: false,
      inactiveAccountDays: 1095,
      staleInviteDays: 180,
      unusedTokenDays: 365,
      dryRun: false,
      batchSize: 200,
    });
  });

  it("enables retention only when the flag is the string true", () => {
    expect(
      readRetentionConfig({ GDPR_RETENTION_ENABLED: "true" }).enabled,
    ).toBe(true);
    expect(
      readRetentionConfig({ GDPR_RETENTION_ENABLED: "false" }).enabled,
    ).toBe(false);
  });

  it("treats only the string true as a dry run", () => {
    expect(readRetentionConfig({ GDPR_RETENTION_DRY_RUN: "true" }).dryRun).toBe(
      true,
    );
    expect(
      readRetentionConfig({ GDPR_RETENTION_DRY_RUN: "false" }).dryRun,
    ).toBe(false);
  });

  it("rejects a cutoff of zero days", () => {
    expect(() =>
      readRetentionConfig({ GDPR_INACTIVE_ACCOUNT_DAYS: "0" }),
    ).toThrow(/GDPR_INACTIVE_ACCOUNT_DAYS/);
  });

  it("subtracts whole days from the run time", () => {
    expect(
      cutoffDate(new Date("2026-09-28T00:00:00.000Z"), 1).toISOString(),
    ).toBe("2026-09-27T00:00:00.000Z");
  });
});
