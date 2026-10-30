import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { City } from "./City";
import type { Organization } from "./Organization";
import type { Project } from "./Project";
import type { User } from "./User";
import type { NativeInputCatalog } from "./NativeInputCatalog";
import {
  INGEST_VISIBILITIES,
  type IngestVisibility,
} from "@/backend/ingest/types";

export interface IngestDocumentAttributes {
  id: string;
  contentHash: string;
  originalFileName: string;
  cityId?: string | null;
  projectId?: string | null;
  organizationId?: string | null;
  uploadedByUserId?: string | null;
  visibility: IngestVisibility;
  markdownReady: boolean;
  catalogId?: string | null;
  s3Key?: string | null;
  data?: Buffer | Uint8Array | null;
  created?: Date;
  lastUpdated?: Date;
}

export type IngestDocumentPk = "id";
export type IngestDocumentId = IngestDocument[IngestDocumentPk];
export type IngestDocumentOptionalAttributes =
  | "id"
  | "cityId"
  | "projectId"
  | "organizationId"
  | "uploadedByUserId"
  | "visibility"
  | "markdownReady"
  | "catalogId"
  | "s3Key"
  | "data"
  | "created"
  | "lastUpdated";
export type IngestDocumentCreationAttributes = Optional<
  IngestDocumentAttributes,
  IngestDocumentOptionalAttributes
>;

export class IngestDocument
  extends Model<IngestDocumentAttributes, IngestDocumentCreationAttributes>
  implements IngestDocumentAttributes
{
  declare id: string;
  declare contentHash: string;
  declare originalFileName: string;
  declare cityId?: string | null;
  declare projectId?: string | null;
  declare organizationId?: string | null;
  declare uploadedByUserId?: string | null;
  declare visibility: IngestVisibility;
  declare markdownReady: boolean;
  declare catalogId?: string | null;
  declare s3Key?: string | null;
  declare data?: Buffer | Uint8Array | null;
  declare created?: Date;
  declare lastUpdated?: Date;

  declare city?: City | null;
  declare project?: Project | null;
  declare organization?: Organization | null;
  declare uploadedBy?: User | null;
  declare catalog?: NativeInputCatalog | null;

  static initModel(sequelize: Sequelize.Sequelize): typeof IngestDocument {
    return IngestDocument.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        contentHash: {
          type: DataTypes.STRING(64),
          allowNull: false,
          field: "content_hash",
        },
        originalFileName: {
          type: DataTypes.STRING(512),
          allowNull: false,
          field: "original_file_name",
        },
        cityId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "city_id",
          references: { model: "City", key: "city_id" },
        },
        projectId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "project_id",
          references: { model: "Project", key: "project_id" },
        },
        organizationId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "organization_id",
          references: { model: "Organization", key: "organization_id" },
        },
        uploadedByUserId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "uploaded_by_user_id",
          references: { model: "User", key: "user_id" },
        },
        visibility: {
          type: DataTypes.STRING(16),
          allowNull: false,
          defaultValue: "city",
          validate: { isIn: [INGEST_VISIBILITIES] },
        },
        markdownReady: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          field: "markdown_ready",
        },
        catalogId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "catalog_id",
          references: { model: "NativeInputCatalog", key: "id" },
        },
        s3Key: {
          type: DataTypes.STRING(1024),
          allowNull: true,
          field: "s3_key",
        },
        data: {
          type: DataTypes.BLOB,
          allowNull: true,
        },
        created: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        lastUpdated: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          field: "last_updated",
        },
      },
      {
        sequelize,
        tableName: "IngestDocument",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        underscored: true,
        indexes: [
          {
            name: "idx_ingest_document_hash_scope",
            fields: [
              { name: "content_hash" },
              { name: "city_id" },
              { name: "project_id" },
              { name: "organization_id" },
            ],
          },
        ],
      },
    );
  }
}
