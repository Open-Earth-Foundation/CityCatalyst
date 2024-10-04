import * as Sequelize from "sequelize";
import { DataTypes, Model } from "sequelize";

enum AssistantMessageRole {
  User = "user",
  Assistant = "assistant",
}
export interface AssistantMessageAttributes {
  assistantMessageId: string;
  threadId: string;
  role: AssistantMessageRole;
  createdAt?: Date;
  content?: string;
}

export type AssistantMessagePk = "assistantMessageId";
export type AssistantMessageId = AssistantMessage[AssistantMessagePk];
export type AssistantMessageCreationAttributes = AssistantMessageAttributes;

export class AssistantMessage
  extends Model<AssistantMessageAttributes, AssistantMessageCreationAttributes>
  implements AssistantMessageAttributes
{
  assistantMessageId!: string;
  threadId!: string;
  role!: AssistantMessageRole;
  createdAt!: Date;
  content!: string;

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
        },
        role: {
          type: DataTypes.ENUM("user", "assistant"),
          allowNull: false,
          field: "role",
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          field: "created_at",
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
