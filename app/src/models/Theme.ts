import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

export interface ThemeAttributes {
  themeId: string;
  themeKey: string;
  created?: Date;
  lastUpdated?: Date;
}

export type ThemePk = "themeId";

export type ThemeId = Theme[ThemePk];

export type ThemeOptionalAttributes = "created" | "lastUpdated";

export type ThemeCreationAttributes = Optional<
  ThemeAttributes,
  ThemeOptionalAttributes
>;

export class Theme
  extends Model<ThemeAttributes, ThemeCreationAttributes>
  implements Partial<ThemeAttributes>
{
  themeId!: string;
  themeKey!: string;
  created?: Date;
  lastUpdated?: Date;

  static initModel(sequelize: Sequelize.Sequelize): typeof Theme {
    return Theme.init(
      {
        themeId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "theme_id",
        },
        themeKey: {
          type: DataTypes.STRING(255),
          allowNull: false,
          field: "theme_key",
        },
      },
      {
        sequelize,
        tableName: "Theme",
        timestamps: true,
        schema: "public",
        createdAt: "created",
        updatedAt: "last_updated",
        underscored: true,
      },
    );
  }
}
