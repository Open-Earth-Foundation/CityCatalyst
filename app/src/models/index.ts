import { Sequelize } from "sequelize";
import pg from "pg";
import * as models from "./init-models";

export const db: {
  initialized: boolean;
  initialize: () => Promise<void>;
  sequelize?: Sequelize | null;
  models: {
    ActivityData: typeof models.ActivityData;
    City: typeof models.City;
    CityUser: typeof models.CityUser;
    DataSource: typeof models.DataSource;
    DataSourceActivityData: typeof models.DataSourceActivityData;
    DataSourceEmissionsFactor: typeof models.DataSourceEmissionsFactor;
    DataSourceGHGs: typeof models.DataSourceGHGs;
    DataSourceMethodology: typeof models.DataSourceMethodology;
    DataSourceReportingLevel: typeof models.DataSourceReportingLevel;
    DataSourceScope: typeof models.DataSourceScope;
    DataSourceSector: typeof models.DataSourceSector;
    DataSourceSubCategory: typeof models.DataSourceSubCategory;
    DataSourceSubSector: typeof models.DataSourceSubSector;
    EmissionsFactor: typeof models.EmissionsFactor;
    GDP: typeof models.GDP;
    GHGs: typeof models.GHGs;
    Inventory: typeof models.Inventory;
    Methodology: typeof models.Methodology;
    Population: typeof models.Population;
    Publisher: typeof models.Publisher;
    ReportingLevel: typeof models.ReportingLevel;
    Scope: typeof models.Scope;
    Sector: typeof models.Sector;
    SectorValue: typeof models.SectorValue;
    SubCategory: typeof models.SubCategory;
    SubCategoryValue: typeof models.SubCategoryValue;
    SubSector: typeof models.SubSector;
    SubSectorReportingLevel: typeof models.SubSectorReportingLevel;
    SubSectorScope: typeof models.SubSectorScope;
    SubSectorValue: typeof models.SubSectorValue;
    User: typeof models.User;
    Version: typeof models.Version;
  };
} = {
  initialized: false,
  sequelize: null,
  initialize,
  models: {
    ActivityData: models.ActivityData,
    City: models.City,
    CityUser: models.CityUser,
    DataSource: models.DataSource,
    DataSourceActivityData: models.DataSourceActivityData,
    DataSourceEmissionsFactor: models.DataSourceEmissionsFactor,
    DataSourceGHGs: models.DataSourceGHGs,
    DataSourceMethodology: models.DataSourceMethodology,
    DataSourceReportingLevel: models.DataSourceReportingLevel,
    DataSourceScope: models.DataSourceScope,
    DataSourceSector: models.DataSourceSector,
    DataSourceSubCategory: models.DataSourceSubCategory,
    DataSourceSubSector: models.DataSourceSubSector,
    EmissionsFactor: models.EmissionsFactor,
    GDP: models.GDP,
    GHGs: models.GHGs,
    Inventory: models.Inventory,
    Methodology: models.Methodology,
    Population: models.Population,
    Publisher: models.Publisher,
    ReportingLevel: models.ReportingLevel,
    Scope: models.Scope,
    Sector: models.Sector,
    SectorValue: models.SectorValue,
    SubCategory: models.SubCategory,
    SubCategoryValue: models.SubCategoryValue,
    SubSector: models.SubSector,
    SubSectorReportingLevel: models.SubSectorReportingLevel,
    SubSectorScope: models.SubSectorScope,
    SubSectorValue: models.SubSectorValue,
    User: models.User,
    Version: models.Version,
  },
};

async function initialize() {
  const sequelize = new Sequelize({
    host: process.env.DATABASE_HOST,
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    dialect: "postgres",
    dialectModule: pg,
  });

  db.models = models.initModels(sequelize);

  db.sequelize = sequelize;
  db.initialized = true;
}
