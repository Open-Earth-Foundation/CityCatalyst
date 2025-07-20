import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import { HighImpactActionRankingStatus } from "@/util/types";

export interface HighImpactActionRankingAttributes {
  id: string;
  locode: string;
  inventoryId: string;
  lang: string;
  created?: Date;
  lastUpdated?: Date;
  jobId?: string | null;
  status?: HighImpactActionRankingStatus | null;
}

export type HighImpactActionRankingPk = "id";
export type HighImpactActionRankingId = HighImpactActionRanking[HighImpactActionRankingPk];
export type HighImpactActionRankingCreationAttributes = Optional<HighImpactActionRankingAttributes, "id">;

export class HighImpactActionRanking
  extends Model<HighImpactActionRankingAttributes, HighImpactActionRankingCreationAttributes>
  implements HighImpactActionRankingAttributes
{
  id!: string;
  locode!: string;
  inventoryId!: string;
  lang!: string;
  created?: Date;
  lastUpdated?: Date;
  jobId?: string | null;
  status?: HighImpactActionRankingStatus | null;

  static initModel(sequelize: Sequelize.Sequelize): typeof HighImpactActionRanking {
    return HighImpactActionRanking.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        locode: {
          type: DataTypes.STRING,
          allowNull: false,
          field: "locode",
        },
        inventoryId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "inventory_id",
        },
        // TODO NINA array of langs
        lang: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        jobId: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "job_id",
        },
        status: {
          type: DataTypes.ENUM(
            HighImpactActionRankingStatus.PENDING,
            HighImpactActionRankingStatus.SUCCESS,
            HighImpactActionRankingStatus.FAILURE
          ),
          allowNull: true,
          field: "status",
        },
      },
      {
        sequelize,
        tableName: "HighImpactActionRanking",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "HighImpactActionRanking_pkey",
            unique: true,
            fields: [{ name: "id" }],
          },
        ],
      },
    );
  }
} 