import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { Scope, ScopeId } from './Scope';
import type { SubSector, SubSectorId } from './SubSector';

export interface SubSectorScopeAttributes {
  subsector_id: string;
  scope_id: string;
  created?: Date;
  last_updated?: Date;
}

export type SubSectorScopePk = "subsector_id" | "scope_id";
export type SubSectorScopeId = SubSectorScope[SubSectorScopePk];
export type SubSectorScopeOptionalAttributes = "created" | "last_updated";
export type SubSectorScopeCreationAttributes = Optional<SubSectorScopeAttributes, SubSectorScopeOptionalAttributes>;

export class SubSectorScope extends Model<SubSectorScopeAttributes, SubSectorScopeCreationAttributes> implements SubSectorScopeAttributes {
  subsector_id!: string;
  scope_id!: string;
  created?: Date;
  last_updated?: Date;

  // SubSectorScope belongsTo Scope via scope_id
  scope!: Scope;
  getScope!: Sequelize.BelongsToGetAssociationMixin<Scope>;
  setScope!: Sequelize.BelongsToSetAssociationMixin<Scope, ScopeId>;
  createScope!: Sequelize.BelongsToCreateAssociationMixin<Scope>;
  // SubSectorScope belongsTo SubSector via subsector_id
  subsector!: SubSector;
  getSubsector!: Sequelize.BelongsToGetAssociationMixin<SubSector>;
  setSubsector!: Sequelize.BelongsToSetAssociationMixin<SubSector, SubSectorId>;
  createSubsector!: Sequelize.BelongsToCreateAssociationMixin<SubSector>;

  static initModel(sequelize: Sequelize.Sequelize): typeof SubSectorScope {
    return SubSectorScope.init({
    subsector_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'SubSector',
        key: 'subsector_id'
      }
    },
    scope_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'Scope',
        key: 'scope_id'
      }
    },
    created: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_updated: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'SubSectorScope',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "SubSectorScope_pkey",
        unique: true,
        fields: [
          { name: "subsector_id" },
          { name: "scope_id" },
        ]
      },
    ]
  });
  }
}
