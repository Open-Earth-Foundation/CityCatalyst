import createHttpError from "http-errors";
import { Op } from "sequelize";

import { db } from "@/models";
import {
  PRIVACY_POLICY_VERSION,
  type ConsentSource,
  type ConsentStatus,
  type ConsentType,
} from "@/util/gdpr/constants";

export interface RecordConsentInput {
  userId: string | null;
  subjectKey: string | null;
  consentType: ConsentType;
  granted: boolean;
  source: ConsentSource;
  userAgent: string | null;
  ipAddress: string | null;
}

export interface ConsentCurrent {
  status: ConsentStatus;
  policyVersion: string;
  created: Date | null;
}

/**
 * Insert one consent event and, when a signed-in user presents a browser
 * subject key, attach that user to earlier anonymous rows for the same key.
 * Status and timestamp on those rows stay as originally written.
 */
export async function recordConsent(input: RecordConsentInput) {
  if (!input.userId && !input.subjectKey) {
    throw new createHttpError.BadRequest(
      "A signed-in user or subjectKey is required",
    );
  }

  if (input.userId && input.subjectKey) {
    await db.models.ConsentRecord.update(
      { userId: input.userId },
      { where: { subjectKey: input.subjectKey, userId: { [Op.is]: null } } },
    );
  }

  const record = await db.models.ConsentRecord.create({
    userId: input.userId,
    subjectKey: input.subjectKey,
    consentType: input.consentType,
    status: input.granted ? "granted" : "withdrawn",
    policyVersion: PRIVACY_POLICY_VERSION,
    source: input.source,
    userAgent: input.userAgent,
    ipAddress: input.ipAddress,
  });

  return record.get({ plain: true });
}

/** Full history for a user, newest first, plus the latest status per type. */
export async function listConsentForUser(userId: string) {
  const records = await db.models.ConsentRecord.findAll({
    where: { userId },
    order: [["created", "DESC"]],
  });
  const plain = records.map((record) => record.get({ plain: true }));
  const current: Partial<Record<ConsentType, ConsentCurrent>> = {};
  for (const record of plain) {
    if (current[record.consentType]) continue;
    current[record.consentType] = {
      status: record.status,
      policyVersion: record.policyVersion,
      created: record.created ?? null,
    };
  }
  return { records: plain, current };
}
