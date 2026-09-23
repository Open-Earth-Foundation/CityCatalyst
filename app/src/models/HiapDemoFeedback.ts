import { DataTypes, Model, Optional } from "sequelize";
import * as Sequelize from "sequelize";

export interface HiapDemoScreenshot {
  url: string;
  key: string;
  filename: string;
  size: number;
}

export interface HiapDemoFeedbackAttributes {
  id: string;
  reviewerName?: string | null;
  organisation?: string | null;
  /** "comment" (one remark) or "answers" (the reviewer questions). */
  kind: string;
  screenId?: string | null;
  section?: string | null;
  category?: string | null;
  priority?: string | null;
  comment?: string | null;
  suggestion?: string | null;
  answers?: Record<string, string> | null;
  screenshots?: HiapDemoScreenshot[] | null;
  lang?: string | null;
  created?: Date;
  lastUpdated?: Date;
}

export type HiapDemoFeedbackPk = "id";
export type HiapDemoFeedbackId = HiapDemoFeedback[HiapDemoFeedbackPk];
export type HiapDemoFeedbackOptionalAttributes =
  | "id"
  | "reviewerName"
  | "organisation"
  | "screenId"
  | "section"
  | "category"
  | "priority"
  | "comment"
  | "suggestion"
  | "answers"
  | "screenshots"
  | "lang"
  | "created"
  | "lastUpdated";
export type HiapDemoFeedbackCreationAttributes = Optional<
  HiapDemoFeedbackAttributes,
  HiapDemoFeedbackOptionalAttributes
>;

/**
 * One piece of reviewer feedback on the Brazil Phase 3 HIAP demo: a single
 * remark with optional screenshots, or a reviewer's answers to the guide's
 * questions. Written by the public demo page; read by admins.
 */
export class HiapDemoFeedback
  extends Model<HiapDemoFeedbackAttributes, HiapDemoFeedbackCreationAttributes>
  implements Partial<HiapDemoFeedbackAttributes>
{
  declare id: string;
  declare reviewerName?: string | null;
  declare organisation?: string | null;
  declare kind: string;
  declare screenId?: string | null;
  declare section?: string | null;
  declare category?: string | null;
  declare priority?: string | null;
  declare comment?: string | null;
  declare suggestion?: string | null;
  declare answers?: Record<string, string> | null;
  declare screenshots?: HiapDemoScreenshot[] | null;
  declare lang?: string | null;
  declare created?: Date;
  declare lastUpdated?: Date;

  static initModel(sequelize: Sequelize.Sequelize): typeof HiapDemoFeedback {
    return HiapDemoFeedback.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        reviewerName: { type: DataTypes.STRING, allowNull: true },
        organisation: { type: DataTypes.STRING, allowNull: true },
        kind: { type: DataTypes.STRING, allowNull: false },
        screenId: { type: DataTypes.STRING, allowNull: true },
        section: { type: DataTypes.STRING, allowNull: true },
        category: { type: DataTypes.STRING, allowNull: true },
        priority: { type: DataTypes.STRING, allowNull: true },
        comment: { type: DataTypes.TEXT, allowNull: true },
        suggestion: { type: DataTypes.TEXT, allowNull: true },
        answers: { type: DataTypes.JSONB, allowNull: true },
        screenshots: { type: DataTypes.JSONB, allowNull: true },
        lang: { type: DataTypes.STRING, allowNull: true },
        created: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
        lastUpdated: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      },
      {
        sequelize,
        underscored: true,
        tableName: "HiapDemoFeedback",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "HiapDemoFeedback_pkey",
            unique: true,
            fields: [{ name: "id" }],
          },
          {
            name: "HiapDemoFeedback_created_index",
            fields: [{ name: "created" }],
          },
        ],
      },
    );
  }
}
