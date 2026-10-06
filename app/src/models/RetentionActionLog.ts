import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

/**
 * Append-only record of retention actions (and dry-run decisions).
 * subject_id is not a foreign key: the row must remain after an invite or
 * token is deleted.
 */
export interface RetentionActionLogAttributes {
  retentionActionLogId: string;
  policyKey: string;
  action: string;
  subjectType: string;
  subjectId: string;
  dryRun: boolean;
  details: Record<string, unknown>;
  created?: Date;
}

export type RetentionActionLogCreationAttributes = Optional<
  RetentionActionLogAttributes,
  "retentionActionLogId" | "dryRun" | "details" | "created"
>;

export class RetentionActionLog
  extends Model<
    RetentionActionLogAttributes,
    RetentionActionLogCreationAttributes
  >
  implements RetentionActionLogAttributes
{
  declare retentionActionLogId: string;
  declare policyKey: string;
  declare action: string;
  declare subjectType: string;
  declare subjectId: string;
  declare dryRun: boolean;
  declare details: Record<string, unknown>;
  declare created?: Date;

  static initModel(sequelize: Sequelize.Sequelize): typeof RetentionActionLog {
    return RetentionActionLog.init(
      {
        retentionActionLogId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
          field: "retention_action_log_id",
        },
        policyKey: {
          type: DataTypes.STRING(64),
          allowNull: false,
          field: "policy_key",
        },
        action: {
          type: DataTypes.STRING(64),
          allowNull: false,
        },
        subjectType: {
          type: DataTypes.STRING(64),
          allowNull: false,
          field: "subject_type",
        },
        subjectId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "subject_id",
        },
        dryRun: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          field: "dry_run",
        },
        details: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        created: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        sequelize,
        tableName: "RetentionActionLog",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: false,
        indexes: [
          {
            name: "RetentionActionLog_subject_idx",
            fields: ["subject_type", "subject_id"],
          },
          {
            name: "RetentionActionLog_policy_key_idx",
            fields: ["policy_key"],
          },
        ],
      },
    );
  }
}
