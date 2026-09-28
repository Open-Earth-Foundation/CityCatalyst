import createHttpError from "http-errors";
import { Op, Sequelize, type WhereOptions } from "sequelize";

import { db } from "@/models";
import { DSAR_ROW_LIMIT } from "@/util/gdpr/constants";
import { PERSONAL_DATA_INVENTORY } from "@/util/gdpr/personal-data-inventory";
import {
  buildDsarExport,
  type DsarDatasetRows,
  type DsarExportResult,
} from "@/backend/gdpr/dsar-format";

export interface DsarSubject {
  userId: string;
  email: string | null;
}

interface Collected {
  rows: Record<string, unknown>[];
  truncated: boolean;
}

type RowModel = {
  findAll: (options: object) => Promise<unknown[]>;
};

type DsarCollector = (subject: DsarSubject) => Promise<Collected>;

function toPlain(row: unknown): Record<string, unknown> {
  if (
    row != null &&
    typeof row === "object" &&
    "get" in row &&
    typeof row.get === "function"
  ) {
    return row.get({ plain: true }) as Record<string, unknown>;
  }
  return { ...(row as Record<string, unknown>) };
}

function pack(rows: unknown[]): Collected {
  const plain = rows.map((row) => toPlain(row));
  if (plain.length > DSAR_ROW_LIMIT) {
    return { rows: plain.slice(0, DSAR_ROW_LIMIT), truncated: true };
  }
  return { rows: plain, truncated: false };
}

async function findCollected(
  model: RowModel,
  where: WhereOptions,
  extra: object = {},
): Promise<Collected> {
  const rows = await model.findAll({
    where,
    limit: DSAR_ROW_LIMIT + 1,
    order: [["created", "DESC"]],
    ...extra,
  });
  return pack(rows);
}

function emailEquals(column: string, email: string): WhereOptions {
  return Sequelize.where(
    Sequelize.fn("lower", Sequelize.col(column)),
    email.toLowerCase(),
  ) as WhereOptions;
}

function inviteWhere(
  subject: DsarSubject,
  idClauses: WhereOptions[],
): WhereOptions {
  const clauses: WhereOptions[] = [...idClauses];
  if (subject.email) clauses.push(emailEquals("email", subject.email));
  return { [Op.or]: clauses };
}

/**
 * One collector per inventoried table. Keys must match personal-data-inventory.
 * File bytes, token hashes, and webhook secrets are not selected.
 */
export const dsarCollectors: Record<string, DsarCollector> = {
  User: async (subject) => {
    const secrets =
      PERSONAL_DATA_INVENTORY.find((dataset) => dataset.table === "User")
        ?.omittedFields ?? [];
    // Password and two-factor material stay in the database. The export
    // never selects those columns.
    const user = await db.models.User.findByPk(subject.userId, {
      attributes: { exclude: secrets },
    });
    return pack(user ? [user] : []);
  },
  CityUser: (subject) =>
    findCollected(db.models.CityUser, { userId: subject.userId }),
  CityInvite: (subject) =>
    findCollected(
      db.models.CityInvite,
      inviteWhere(subject, [
        { userId: subject.userId },
        { invitingUserId: subject.userId },
      ]),
    ),
  OrganizationInvite: (subject) =>
    findCollected(
      db.models.OrganizationInvite,
      inviteWhere(subject, [{ userId: subject.userId }]),
    ),
  ProjectInvite: (subject) =>
    findCollected(
      db.models.ProjectInvite,
      inviteWhere(subject, [{ userId: subject.userId }]),
    ),
  OrganizationAdmin: (subject) =>
    findCollected(db.models.OrganizationAdmin, { userId: subject.userId }),
  ProjectAdmin: (subject) =>
    findCollected(db.models.ProjectAdmin, { userId: subject.userId }),
  Organization: async (subject) => {
    if (!subject.email) return pack([]);
    return findCollected(
      db.models.Organization,
      emailEquals("contact_email", subject.email),
    );
  },
  UserFile: (subject) =>
    findCollected(
      db.models.UserFile,
      { userId: subject.userId },
      {
        attributes: { exclude: ["data"] },
      },
    ),
  ImportedInventoryFile: (subject) =>
    findCollected(
      db.models.ImportedInventoryFile,
      { userId: subject.userId },
      { attributes: { exclude: ["data", "s3Key", "contentDigest"] } },
    ),
  PersonalAccessToken: (subject) =>
    findCollected(
      db.models.PersonalAccessToken,
      { userId: subject.userId },
      { attributes: { exclude: ["tokenHash"] } },
    ),
  OAuthClientAuthz: (subject) =>
    findCollected(db.models.OAuthClientAuthz, { userId: subject.userId }),
  WebhookSubscription: (subject) =>
    findCollected(
      db.models.WebhookSubscription,
      { createdBy: subject.userId },
      {
        attributes: {
          exclude: [
            "secretCiphertext",
            "secretIv",
            "secretAuthTag",
            "secretPrefix",
          ],
        },
      },
    ),
  HighImpactActionRanking: (subject) =>
    findCollected(db.models.HighImpactActionRanking, {
      userId: subject.userId,
    }),
  BulkInventoryImportJob: (subject) =>
    findCollected(
      db.models.BulkInventoryImportJob,
      { userId: subject.userId },
      { attributes: { exclude: ["s3Key"] } },
    ),
  MeedRanking: (subject) =>
    findCollected(db.models.MeedRanking, { userId: subject.userId }),
  NativeInputCatalog: (subject) =>
    findCollected(db.models.NativeInputCatalog, { userId: subject.userId }),
  ConsentRecord: (subject) =>
    findCollected(db.models.ConsentRecord, { userId: subject.userId }),
  RetentionActionLog: (subject) =>
    findCollected(db.models.RetentionActionLog, {
      subjectType: "user",
      subjectId: subject.userId,
    }),
};

export async function exportPersonalData(
  userId: string,
  exportedAt = new Date(),
): Promise<DsarExportResult> {
  const missing = PERSONAL_DATA_INVENTORY.filter(
    (dataset) => !dsarCollectors[dataset.table],
  );
  if (missing.length > 0) {
    throw new Error(
      `DSAR collectors missing: ${missing.map((dataset) => dataset.table).join(", ")}`,
    );
  }

  const user = await db.models.User.findByPk(userId);
  if (!user) throw new createHttpError.NotFound("User not found");

  const subject: DsarSubject = { userId, email: user.email ?? null };
  const datasets: DsarDatasetRows[] = [];
  for (const dataset of PERSONAL_DATA_INVENTORY) {
    const collected = await dsarCollectors[dataset.table](subject);
    datasets.push({ dataset, ...collected });
  }

  return buildDsarExport({ userId, exportedAt, datasets });
}
