export interface RetentionConfig {
  /** Only the string "true" turns the job on. Anything else skips the run. */
  enabled: boolean;
  inactiveAccountDays: number;
  staleInviteDays: number;
  unusedTokenDays: number;
  dryRun: boolean;
  batchSize: number;
}

const DEFAULTS = {
  inactiveAccountDays: 1095,
  staleInviteDays: 180,
  unusedTokenDays: 365,
  batchSize: 200,
} as const;

function positiveInt(
  name: string,
  fallback: number,
  raw: string | undefined,
  max: number,
): number {
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be an integer from 1 to ${max}`);
  }
  return value;
}

/**
 * Retention windows are read on each cron run.
 * The job stays off unless GDPR_RETENTION_ENABLED is the string "true".
 * Unset window variables use the defaults. A set but invalid value fails the run
 * rather than falling through to a dangerous cutoff (for example 0 days).
 */
export function readRetentionConfig(
  env: NodeJS.ProcessEnv = process.env,
): RetentionConfig {
  return {
    enabled: env.GDPR_RETENTION_ENABLED === "true",
    inactiveAccountDays: positiveInt(
      "GDPR_INACTIVE_ACCOUNT_DAYS",
      DEFAULTS.inactiveAccountDays,
      env.GDPR_INACTIVE_ACCOUNT_DAYS,
      36500,
    ),
    staleInviteDays: positiveInt(
      "GDPR_STALE_INVITE_DAYS",
      DEFAULTS.staleInviteDays,
      env.GDPR_STALE_INVITE_DAYS,
      36500,
    ),
    unusedTokenDays: positiveInt(
      "GDPR_UNUSED_TOKEN_DAYS",
      DEFAULTS.unusedTokenDays,
      env.GDPR_UNUSED_TOKEN_DAYS,
      36500,
    ),
    dryRun: env.GDPR_RETENTION_DRY_RUN === "true",
    batchSize: positiveInt(
      "GDPR_RETENTION_BATCH_SIZE",
      DEFAULTS.batchSize,
      env.GDPR_RETENTION_BATCH_SIZE,
      1000,
    ),
  };
}

export function cutoffDate(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
