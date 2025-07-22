import { LANGUAGES } from "@/util/types";
import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import { languages } from "@/i18n/settings";

export interface HighImpactActionRankedAttributes {
  id: string;
  hiaRankingId: string;
  type: string;
  name: string;
  hazards?: string[];
  sectors?: string[];
  subsectors?: string[];
  primaryPurposes?: string[];
  description?: string;
  dependencies?: string[];
  cobenefits?: Record<string, any>;
  equityAndInclusionConsiderations?: string;
  GHGReductionPotential?: Record<string, any>;
  adaptationEffectiveness?: string;
  adaptationEffectivenessPerHazard?: Record<string, any>;
  costInvestmentNeeded?: string;
  timelineForImplementation?: string;
  keyPerformanceIndicators?: string[];
  powersAndMandates?: string[];
  biome?: string;
  isSelected?: boolean;
  actionId: string;
  rank: number;
  explanation: { [key in keyof typeof languages]: string};
  lang: string;
  created?: Date;
  lastUpdated?: Date;
}

export type HighImpactActionRankedPk = "id";
export type HighImpactActionRankedId = HighImpactActionRanked[HighImpactActionRankedPk];
export type HighImpactActionRankedCreationAttributes = Optional<HighImpactActionRankedAttributes, "id">;

export class HighImpactActionRanked
  extends Model<
    HighImpactActionRankedAttributes,
    HighImpactActionRankedCreationAttributes
  >
  implements HighImpactActionRankedAttributes
{
  id!: string;
  hiaRankingId!: string;
  actionId!: string;
  rank!: number;
  explanation!: { [key in keyof typeof languages]: string };
  lang!: string;
  isSelected?: boolean;
  type!: string;
  name!: string;
  hazard?: string[];
  sector?: string[];
  subsector?: string[];
  primaryPurpose?: string[];
  description?: string;
  dependencies?: string[];
  cobenefits?: Record<string, any>;
  equityAndInclusionConsiderations?: string;
  GHGReductionPotential?: Record<string, any>;
  adaptationEffectiveness?: string;
  adaptationEffectivenessPerHazard?: Record<string, any>;
  costInvestmentNeeded?: string;
  timelineForImplementation?: string;
  keyPerformanceIndicators?: string[];
  powersAndMandates?: string[];
  biome?: string;
  created?: Date;
  lastUpdated?: Date;

  static initModel(
    sequelize: Sequelize.Sequelize,
  ): typeof HighImpactActionRanked {
    return HighImpactActionRanked.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        hiaRankingId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "hia_ranking_id",
        },
        lang: {
          type: DataTypes.TEXT,
          allowNull: false,
          field: "lang",
        },
        type: {
          type: DataTypes.ENUM("mitigation", "adaptation"),
          allowNull: false,
        },
        name: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        hazards: {
          type: DataTypes.ARRAY(DataTypes.TEXT),
          allowNull: true,
        },
        sectors: {
          type: DataTypes.ARRAY(DataTypes.TEXT),
          allowNull: true,
        },
        subsectors: {
          type: DataTypes.ARRAY(DataTypes.TEXT),
          allowNull: true,
        },
        primaryPurposes: {
          type: DataTypes.ARRAY(DataTypes.TEXT),
          allowNull: true,
          field: "primary_purposes",
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        dependencies: {
          type: DataTypes.ARRAY(DataTypes.TEXT),
          allowNull: true,
        },
        cobenefits: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        equityAndInclusionConsiderations: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "equity_and_inclusion_considerations",
        },
        GHGReductionPotential: {
          type: DataTypes.JSONB,
          allowNull: true,
          field: "ghg_reduction_potential",
        },
        adaptationEffectiveness: {
          type: DataTypes.ENUM("high", "medium", "low"),
          allowNull: true,
          field: "adaptation_effectiveness",
        },
        adaptationEffectivenessPerHazard: {
          type: DataTypes.JSONB,
          allowNull: true,
          field: "adaptation_effectiveness_per_hazard",
        },
        costInvestmentNeeded: {
          type: DataTypes.ENUM("high", "medium", "low"),
          allowNull: true,
          field: "cost_investment_needed",
        },
        timelineForImplementation: {
          type: DataTypes.ENUM("<5 years", "5-10 years", ">10 years"),
          allowNull: true,
          field: "timeline_for_implementation",
        },
        keyPerformanceIndicators: {
          type: DataTypes.ARRAY(DataTypes.TEXT),
          allowNull: true,
          field: "key_performance_indicators",
        },
        powersAndMandates: {
          type: DataTypes.ARRAY(DataTypes.TEXT),
          allowNull: true,
          field: "powers_and_mandates",
        },
        biome: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        isSelected: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          field: "is_selected",
        },
        actionId: {
          type: DataTypes.TEXT,
          allowNull: false,
          field: "action_id",
        },
        rank: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        explanation: {
          type: DataTypes.JSONB,
          allowNull: false,
        },
      },
      {
        sequelize,
        tableName: "HighImpactActionRanked",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "HighImpactActionRanked_pkey",
            unique: true,
            fields: [{ name: "id" }],
          },
        ],
      },
    );
  }
} 