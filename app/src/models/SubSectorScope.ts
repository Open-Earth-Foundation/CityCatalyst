import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { Scope, ScopeId } from "./Scope";
import type { SubSector, SubSectorId } from "./SubSector";

export interface SubSectorScopeAttributes {
  subsectorId: string;
  scopeId: string;
  created?: Date;
  lastUpdated?: Date;
}

export type SubSectorScopePk = "subsectorId" | "scopeId";
export type SubSectorScopeId = SubSectorScope[SubSectorScopePk];
export type SubSectorScopeOptionalAttributes = "created" | "lastUpdated";
export type SubSectorScopeCreationAttributes = Optional<
  SubSectorScopeAttributes,
  SubSectorScopeOptionalAttributes
>;

export class SubSectorScope
  extends Model<SubSectorScopeAttributes, SubSectorScopeCreationAttributes>
  implements SubSectorScopeAttributes
{
  subsectorId!: string;
  scopeId!: string;
  created?: Date;
  lastUpdated?: Date;

  // SubSectorScope belongsTo Scope via scopeId
  scope!: Scope;
  getScope!: Sequelize.BelongsToGetAssociationMixin<Scope>;
  setScope!: Sequelize.BelongsToSetAssociationMixin<Scope, ScopeId>;
  createScope!: Sequelize.BelongsToCreateAssociationMixin<Scope>;
  // SubSectorScope belongsTo SubSector via subsectorId
  subsector!: SubSector;
  getSubsector!: Sequelize.BelongsToGetAssociationMixin<SubSector>;
  setSubsector!: Sequelize.BelongsToSetAssociationMixin<SubSector, SubSectorId>;
  createSubsector!: Sequelize.BelongsToCreateAssociationMixin<SubSector>;

  static initModel(sequelize: Sequelize.Sequelize): typeof SubSectorScope {
    return SubSectorScope.init(
      {
        subsectorId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          references: {
            model: "SubSector",
            key: "subsector_id",
          },
          field: "subsector_id",
        },
        scopeId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          references: {
            model: "Scope",
            key: "scope_id",
          },
          field: "scope_id",
        },
      },
      {
        sequelize,
        tableName: "SubSectorScope",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "SubSectorScope_pkey",
            unique: true,
            fields: [{ name: "subsector_id" }, { name: "scope_id" }],
          },
        ],
      },
    );
  }
}
