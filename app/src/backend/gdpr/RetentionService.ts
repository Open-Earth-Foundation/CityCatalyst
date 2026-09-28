import { Op, Sequelize, type Transaction, type WhereOptions } from "sequelize";
import { db } from "@/models";
import { logger } from "@/services/logger";
import { InviteStatus } from "@/util/types";
import {
  cutoffDate,
  readRetentionConfig,
  type RetentionConfig,
} from "@/util/gdpr/retention-config";

export interface RetentionPolicyResult {
  matched: number;
  applied: number;
  failed: number;
}

export interface RetentionRunResult {
  runId: string;
  dryRun: boolean;
  inactiveAccountAnonymize: RetentionPolicyResult;
  staleInviteDelete: RetentionPolicyResult;
  unusedTokenRevoke: RetentionPolicyResult;
}

interface LogInput {
  policyKey: string;
  action: string;
  subjectType: string;
  subjectId: string;
  dryRun: boolean;
  details: Record<string, unknown>;
  transaction: Transaction;
}

function anonymizedEmail(userId: string): string {
  return `anonymized+${userId}@anonymized.invalid`;
}

function emailEquals(column: string, email: string): WhereOptions {
  return Sequelize.where(
    Sequelize.fn("lower", Sequelize.col(column)),
    email.toLowerCase(),
  ) as WhereOptions;
}

async function withTransaction<T>(
  work: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  const sequelize = db.sequelize;
  if (!sequelize) throw new Error("Database is not initialized");
  return sequelize.transaction(work);
}

async function writeLog(input: LogInput): Promise<void> {
  await db.models.RetentionActionLog.create(
    {
      policyKey: input.policyKey,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      dryRun: input.dryRun,
      details: input.details,
    },
    { transaction: input.transaction },
  );
}

function emptyResult(): RetentionPolicyResult {
  return { matched: 0, applied: 0, failed: 0 };
}

function addResult(
  total: RetentionPolicyResult,
  next: RetentionPolicyResult,
): void {
  total.matched += next.matched;
  total.applied += next.applied;
  total.failed += next.failed;
}

async function anonymizeInactiveAccounts(
  now: Date,
  config: RetentionConfig,
  runId: string,
): Promise<RetentionPolicyResult> {
  const cutoff = cutoffDate(now, config.inactiveAccountDays);
  const users = await db.models.User.findAll({
    where: {
      anonymizedAt: { [Op.is]: null },
      [Op.and]: [
        Sequelize.where(
          Sequelize.fn(
            "COALESCE",
            Sequelize.col("last_active_at"),
            Sequelize.col("last_updated"),
            Sequelize.col("created"),
          ),
          { [Op.lt]: cutoff },
        ),
      ],
    },
    limit: config.batchSize,
  });

  const result = emptyResult();
  result.matched = users.length;

  for (const user of users) {
    try {
      await withTransaction(async (transaction) => {
        // Log inside the same transaction as the mutation so a failed
        // anonymization does not leave a record of an action that did not happen.
        await writeLog({
          policyKey: "inactive_account_anonymize",
          action: "anonymize_user",
          subjectType: "user",
          subjectId: user.userId,
          dryRun: config.dryRun,
          details: { runId, hadEmail: Boolean(user.email) },
          transaction,
        });
        if (config.dryRun) return;

        const previousEmail = user.email ?? null;
        // Columns are nullable. The User attribute types stay `string` because
        // the rest of the app treats a live account's name as a string.
        await user.update(
          {
            name: null,
            email: anonymizedEmail(user.userId),
            pictureUrl: null,
            title: null,
            passwordHash: null,
            twoFactorEnabled: false,
            twoFactorSecret: null,
            twoFactorRecoveryHashes: [],
            anonymizedAt: now,
          } as unknown as Parameters<typeof user.update>[0],
          { transaction },
        );

        if (!previousEmail) return;
        const replacement = anonymizedEmail(user.userId);
        const whereEmail = emailEquals("email", previousEmail);
        await db.models.CityInvite.update(
          { email: replacement },
          { where: whereEmail, transaction },
        );
        await db.models.OrganizationInvite.update(
          { email: replacement },
          { where: whereEmail, transaction },
        );
        await db.models.ProjectInvite.update(
          { email: replacement },
          { where: whereEmail, transaction },
        );
        await db.models.Organization.update(
          { contactEmail: replacement },
          {
            where: emailEquals("contact_email", previousEmail),
            transaction,
          },
        );
      });
      if (!config.dryRun) result.applied += 1;
    } catch (err) {
      result.failed += 1;
      logger.error(
        { err, userId: user.userId },
        "Retention failed to anonymize account",
      );
    }
  }

  return result;
}

interface InviteRow {
  id: string;
  userId?: string | null;
  destroy: (options: { transaction: Transaction }) => Promise<void>;
}

async function deleteStaleInvites(
  model: { findAll: (options: object) => Promise<InviteRow[]> },
  table: string,
  cutoff: Date,
  config: RetentionConfig,
  runId: string,
): Promise<RetentionPolicyResult> {
  const invites = await model.findAll({
    where: {
      status: InviteStatus.PENDING,
      created: { [Op.lt]: cutoff },
    },
    limit: config.batchSize,
  });
  const result = emptyResult();
  result.matched = invites.length;

  for (const invite of invites) {
    try {
      await withTransaction(async (transaction) => {
        const linkedUserId = invite.userId ?? null;
        await writeLog({
          policyKey: "stale_invite_delete",
          action: "delete_invite",
          subjectType: linkedUserId ? "user" : table,
          subjectId: linkedUserId ?? invite.id,
          dryRun: config.dryRun,
          details: { runId, inviteId: invite.id, table },
          transaction,
        });
        if (!config.dryRun) await invite.destroy({ transaction });
      });
      if (!config.dryRun) result.applied += 1;
    } catch (err) {
      result.failed += 1;
      logger.error(
        { err, table, inviteId: invite.id },
        "Retention failed to delete invite",
      );
    }
  }

  return result;
}

interface TokenRow {
  id: string;
  userId: string;
  tokenPrefix: string;
  destroy: (options: { transaction: Transaction }) => Promise<void>;
}

async function revokeUnusedTokens(
  now: Date,
  config: RetentionConfig,
  runId: string,
): Promise<RetentionPolicyResult> {
  const cutoff = cutoffDate(now, config.unusedTokenDays);
  const tokens = (await db.models.PersonalAccessToken.findAll({
    where: {
      [Op.or]: [
        { lastUsedAt: { [Op.lt]: cutoff } },
        { lastUsedAt: { [Op.is]: null }, created: { [Op.lt]: cutoff } },
      ],
    },
    limit: config.batchSize,
  })) as unknown as TokenRow[];

  const result = emptyResult();
  result.matched = tokens.length;

  for (const token of tokens) {
    try {
      await withTransaction(async (transaction) => {
        await writeLog({
          policyKey: "unused_token_revoke",
          action: "revoke_token",
          subjectType: "user",
          subjectId: token.userId,
          dryRun: config.dryRun,
          details: { runId, tokenId: token.id, tokenPrefix: token.tokenPrefix },
          transaction,
        });
        if (!config.dryRun) await token.destroy({ transaction });
      });
      if (!config.dryRun) result.applied += 1;
    } catch (err) {
      result.failed += 1;
      logger.error(
        { err, tokenId: token.id },
        "Retention failed to revoke token",
      );
    }
  }

  return result;
}

/**
 * Apply configured retention policies once.
 * GDPR_RETENTION_DRY_RUN=true writes the log and changes no personal data.
 * Each policy stops after GDPR_RETENTION_BATCH_SIZE rows; the next run continues.
 */
export async function enforceRetentionPolicies(
  now = new Date(),
): Promise<RetentionRunResult> {
  const config = readRetentionConfig();
  const runId = crypto.randomUUID();
  const inviteCutoff = cutoffDate(now, config.staleInviteDays);

  const staleInviteDelete = emptyResult();
  const asInviteModel = (model: object) =>
    model as { findAll: (options: object) => Promise<InviteRow[]> };

  const [inactiveAccountAnonymize, unusedTokenRevoke, ...inviteResults] =
    await Promise.all([
      anonymizeInactiveAccounts(now, config, runId),
      revokeUnusedTokens(now, config, runId),
      deleteStaleInvites(
        asInviteModel(db.models.CityInvite),
        "CityInvite",
        inviteCutoff,
        config,
        runId,
      ),
      deleteStaleInvites(
        asInviteModel(db.models.OrganizationInvite),
        "OrganizationInvite",
        inviteCutoff,
        config,
        runId,
      ),
      deleteStaleInvites(
        asInviteModel(db.models.ProjectInvite),
        "ProjectInvite",
        inviteCutoff,
        config,
        runId,
      ),
    ]);

  for (const inviteResult of inviteResults) {
    addResult(staleInviteDelete, inviteResult);
  }

  logger.info(
    {
      runId,
      dryRun: config.dryRun,
      inactiveAccountAnonymize,
      staleInviteDelete,
      unusedTokenRevoke,
    },
    "Retention run finished",
  );

  return {
    runId,
    dryRun: config.dryRun,
    inactiveAccountAnonymize,
    staleInviteDelete,
    unusedTokenRevoke,
  };
}
