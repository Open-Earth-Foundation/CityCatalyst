import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

export enum AssistantMessageRole {
  User = "user",
  Assistant = "assistant",
}

export interface AssistantMessageAttributes {
  assistantMessageId: string;
  threadId: string;
  role: AssistantMessageRole;
  timestamp?: Date;
  content?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type AssistantMessagePk = "assistantMessageId";
export type AssistantMessageId = AssistantMessage[AssistantMessagePk];
export type AssistantMessageOptionalAttributes = "created" | "lastUpdated";
export type AssistantMessageCreationAttributes = Optional<
  AssistantMessageAttributes,
  AssistantMessageOptionalAttributes
>;

export class AssistantMessage
  extends Model<AssistantMessageAttributes, AssistantMessageCreationAttributes>
  implements AssistantMessageAttributes
{
  assistantMessageId!: string;
  threadId!: string;
  role!: AssistantMessageRole;
  timestamp!: Date;
  content!: string;
  created?: Date;
  lastUpdated?: Date;

  static initModel(sequelize: Sequelize.Sequelize): typeof AssistantMessage {
    return AssistantMessage.init(
      {
        assistantMessageId: {
          type: DataTypes.STRING,
          allowNull: false,
          primaryKey: true,
          field: "assistant_message_id",
        },
        threadId: {
          type: DataTypes.STRING,
          allowNull: false,
          field: "thread_id",
          references: {
            model: "AssistantThread",
            key: "assistant_thread_id",
          },
        },
        role: {
          type: DataTypes.ENUM("user", "assistant"),
          allowNull: false,
          field: "role",
        },
        timestamp: {
          type: DataTypes.DATE,
          allowNull: false,
          field: "timestamp",
        },
        content: {
          type: DataTypes.STRING,
          allowNull: false,
          field: "content",
        },
      },
      {
        sequelize,
        tableName: "AssistantMessage",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "AssistantMessage_pkey",
            unique: true,
            fields: [{ name: "assistant_message_id" }],
          },
          {
            name: "AssistantMessage_ThreadId",
            unique: false,
            fields: [{ name: "thread_id" }],
          },
        ],
      },
    );
  }
}
