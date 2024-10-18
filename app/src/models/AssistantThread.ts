import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

export interface AssistantThreadAttributes {
  assistantThreadId: string;
  assistantId?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type AssistantThreadPk = "assistantThreadId";
export type AssistantThreadId = AssistantThread[AssistantThreadPk];
export type AssistantThreadOptionalAttributes =
  | "assistantId"
  | "created"
  | "lastUpdated";
export type AssistantThreadCreationAttributes = Optional<
  AssistantThreadAttributes,
  AssistantThreadOptionalAttributes
>;

export class AssistantThread
  extends Model<AssistantThreadAttributes, AssistantThreadCreationAttributes>
  implements AssistantThreadAttributes
{
  assistantThreadId!: string;
  assistantId?: string;
  created?: Date;
  lastUpdated?: Date;

  static initModel(sequelize: Sequelize.Sequelize): typeof AssistantThread {
    return AssistantThread.init(
      {
        assistantThreadId: {
          type: DataTypes.STRING,
          allowNull: false,
          primaryKey: true,
          field: "assistant_thread_id",
        },
        assistantId: {
          type: DataTypes.STRING,
          allowNull: true,
          field: "assistant_id",
        },
      },
      {
        sequelize,
        tableName: "AssistantThread",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "AssistantThread_pkey",
            unique: true,
            fields: [{ name: "assistant_thread_id" }],
          },
          {
            name: "AssistantThread_AssistantId",
            unique: false,
            fields: [{ name: "assistant_id" }],
          },
        ],
      },
    );
  }
}
