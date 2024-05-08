import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { InventoryValue, InventoryValueId } from './InventoryValue';

export interface ActivityValueAttributes {
  id: string;
  activityData?: string;
  inventoryValueId?: string;
  metadata?: object;
  created?: Date;
  lastUpdated?: Date;
}

export type ActivityValuePk = "id";
export type ActivityValueId = ActivityValue[ActivityValuePk];
export type ActivityValueOptionalAttributes = "activityData" | "inventoryValueId" | "metadata" | "created" | "lastUpdated";
export type ActivityValueCreationAttributes = Optional<ActivityValueAttributes, ActivityValueOptionalAttributes>;

export class ActivityValue extends Model<ActivityValueAttributes, ActivityValueCreationAttributes> implements ActivityValueAttributes {
  id!: string;
  activityData?: string;
  inventoryValueId?: string;
  metadata?: object;
  created?: Date;
  lastUpdated?: Date;

  // ActivityValue belongsTo InventoryValue via inventoryValueId
  inventoryValue!: InventoryValue;
  getInventoryValue!: Sequelize.BelongsToGetAssociationMixin<InventoryValue>;
  setInventoryValue!: Sequelize.BelongsToSetAssociationMixin<InventoryValue, InventoryValueId>;
  createInventoryValue!: Sequelize.BelongsToCreateAssociationMixin<InventoryValue>;

  static initModel(sequelize: Sequelize.Sequelize): typeof ActivityValue {
    return ActivityValue.init({
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true
    },
    activityData: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'activity_data'
    },
    inventoryValueId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'InventoryValue',
        key: 'id'
      },
      field: 'inventory_value_id'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'ActivityValue',
    schema: 'public',
    timestamps: true,
    createdAt: 'created',
    updatedAt: 'last_updated',
    indexes: [
      {
        name: "ActivityValue_pkey",
        unique: true,
        fields: [
          { name: "id" },
        ]
      },
    ]
  });
  }
}
