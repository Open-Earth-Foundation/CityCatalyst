import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { User, UserId } from "./User";
import type {
  ConsentSource,
  ConsentStatus,
  ConsentType,
} from "@/util/gdpr/constants";

/**
 * Append-only proof of consent. A grant or withdrawal inserts a new row.
 * Existing rows are not rewritten except to attach user_id when an anonymous
 * browser later signs in.
 */
export interface ConsentRecordAttributes {
  consentRecordId: string;
  userId?: string | null;
  subjectKey?: string | null;
  consentType: ConsentType;
  status: ConsentStatus;
  policyVersion: string;
  source: ConsentSource;
  userAgent?: string | null;
  ipAddress?: string | null;
  created?: Date;
}

export type ConsentRecordCreationAttributes = Optional<
  ConsentRecordAttributes,
  | "consentRecordId"
  | "userId"
  | "subjectKey"
  | "userAgent"
  | "ipAddress"
  | "created"
>;

export class ConsentRecord
  extends Model<ConsentRecordAttributes, ConsentRecordCreationAttributes>
  implements ConsentRecordAttributes
{
  declare consentRecordId: string;
  declare userId?: string | null;
  declare subjectKey?: string | null;
  declare consentType: ConsentType;
  declare status: ConsentStatus;
  declare policyVersion: string;
  declare source: ConsentSource;
  declare userAgent?: string | null;
  declare ipAddress?: string | null;
  declare created?: Date;

  declare user?: User;
  declare getUser: Sequelize.BelongsToGetAssociationMixin<User>;
  declare setUser: Sequelize.BelongsToSetAssociationMixin<User, UserId>;

  static initModel(sequelize: Sequelize.Sequelize): typeof ConsentRecord {
    return ConsentRecord.init(
      {
        consentRecordId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
          field: "consent_record_id",
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "user_id",
          references: { model: "User", key: "user_id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        subjectKey: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "subject_key",
        },
        consentType: {
          type: DataTypes.STRING(32),
          allowNull: false,
          field: "consent_type",
        },
        status: {
          type: DataTypes.STRING(32),
          allowNull: false,
        },
        policyVersion: {
          type: DataTypes.STRING(64),
          allowNull: false,
          field: "policy_version",
        },
        source: {
          type: DataTypes.STRING(32),
          allowNull: false,
        },
        userAgent: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "user_agent",
        },
        ipAddress: {
          type: DataTypes.STRING(64),
          allowNull: true,
          field: "ip_address",
        },
        created: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        sequelize,
        tableName: "ConsentRecord",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: false,
        indexes: [
          {
            name: "ConsentRecord_user_id_idx",
            fields: ["user_id"],
          },
          {
            name: "ConsentRecord_subject_key_idx",
            fields: ["subject_key"],
          },
        ],
      },
    );
  }
}
