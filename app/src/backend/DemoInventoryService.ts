import ECRFImportService from "@/backend/ECRFImportService";
import FileParserService from "@/backend/FileParserService";
import InventoryImportService from "@/backend/InventoryImportService";
import { AppSession } from "@/lib/auth";
import { db } from "@/models";
import { logger } from "@/services/logger";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";
import createHttpError from "http-errors";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import UserService from "./UserService";

export const DEMO_INVENTORY_TEMPLATES = {
  "porto-alegre-2022": {
    id: "porto-alegre-2022",
    cityName: "Porto Alegre Demo",
    country: "Brazil",
    countryLocode: "BR",
    region: "Rio Grande do Sul",
    /**
     * Real UN/LOCODE for the source city. Used to reuse external lookups
     * (boundary, etc.) when the synthetic locode of a demo city is presented.
     */
    boundaryLocode: "BR POA",
    year: 2022,
    inventoryName: "Porto Alegre 2022 Demo Inventory",
    inventoryType: InventoryTypeEnum.GPC_BASIC_PLUS,
    globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    fileName: "porto-alegre-2022-demo-inventory.csv",
    dataSourceName: "Porto Alegre 2022 demo inventory template",
  },
} as const;

export type DemoInventoryTemplateId = keyof typeof DEMO_INVENTORY_TEMPLATES;

const DEMO_LOCODE_MARKER = "DEMO-";

/**
 * Returns the real UN/LOCODE that should be used for external lookups when a
 * synthetic demo city locode is provided. Returns null if the locode does not
 * belong to a registered demo template.
 */
export function resolveDemoBoundaryLocode(locode: string): string | null {
  if (!locode.includes(DEMO_LOCODE_MARKER)) {
    return null;
  }
  for (const template of Object.values(DEMO_INVENTORY_TEMPLATES)) {
    if (locode.includes(`${DEMO_LOCODE_MARKER}${template.id}-`)) {
      return template.boundaryLocode;
    }
  }
  return null;
}

export type ProvisionDemoInventoryProps = {
  projectId: string;
  templateId: DemoInventoryTemplateId;
};

export type ProvisionDemoInventoryResult = {
  templateId: DemoInventoryTemplateId;
  cityId: string;
  inventoryId: string;
  createdCity: boolean;
  createdInventory: boolean;
  importedRows: number;
  skippedRows: number;
  warnings: string[];
};

export default class DemoInventoryService {
  public static async provisionDemoInventory(
    props: ProvisionDemoInventoryProps,
    session: AppSession | null,
  ): Promise<ProvisionDemoInventoryResult> {
    UserService.ensureIsAdmin(session);

    const template = DEMO_INVENTORY_TEMPLATES[props.templateId];
    if (!template) {
      throw new createHttpError.BadRequest(
        "Unsupported demo inventory template",
      );
    }

    const project = await db.models.Project.findByPk(props.projectId, {
      include: [
        {
          model: db.models.City,
          as: "cities",
          attributes: ["cityId", "locode"],
        },
      ],
    });

    if (!project) {
      throw new createHttpError.NotFound("Project not found");
    }

    const locode = this.demoLocode(props.projectId, props.templateId);
    let city = await db.models.City.findOne({ where: { locode } });
    let createdCity = false;

    if (!city) {
      const projectCityCount = project.cities?.length ?? 0;
      if (projectCityCount >= Number(project.cityCountLimit)) {
        throw new createHttpError.BadRequest("city-count-limit-reached");
      }

      city = await db.models.City.create({
        cityId: randomUUID(),
        locode,
        name: template.cityName,
        country: template.country,
        countryLocode: template.countryLocode,
        region: template.region,
        projectId: props.projectId,
      });
      createdCity = true;
    } else if (city.projectId !== props.projectId) {
      throw new createHttpError.Conflict(
        "Demo inventory city already belongs to another project",
      );
    }

    let inventory = await db.models.Inventory.findOne({
      where: {
        cityId: city.cityId,
        year: template.year,
      },
    });
    let createdInventory = false;

    if (!inventory) {
      inventory = await db.models.Inventory.create({
        inventoryId: randomUUID(),
        inventoryName: template.inventoryName,
        year: template.year,
        cityId: city.cityId,
        inventoryType: template.inventoryType,
        globalWarmingPotentialType: template.globalWarmingPotentialType,
      });
      createdInventory = true;
    }

    const existingValuesCount = await db.models.InventoryValue.count({
      where: { inventoryId: inventory.inventoryId },
    });

    if (existingValuesCount > 0) {
      return {
        templateId: props.templateId,
        cityId: city.cityId,
        inventoryId: inventory.inventoryId,
        createdCity,
        createdInventory,
        importedRows: 0,
        skippedRows: 0,
        warnings: [
          "Demo inventory already had imported values; import skipped.",
        ],
      };
    }

    const importSummary = await this.importTemplateCsv(
      template.fileName,
      inventory.inventoryId,
      template.dataSourceName,
    );

    logger.info(
      {
        projectId: props.projectId,
        cityId: city.cityId,
        inventoryId: inventory.inventoryId,
        importedRows: importSummary.importedRows,
      },
      "Demo inventory provisioned",
    );

    return {
      templateId: props.templateId,
      cityId: city.cityId,
      inventoryId: inventory.inventoryId,
      createdCity,
      createdInventory,
      importedRows: importSummary.importedRows,
      skippedRows: importSummary.skippedRows,
      warnings: importSummary.warnings,
    };
  }

  private static demoLocode(
    projectId: string,
    templateId: DemoInventoryTemplateId,
  ): string {
    const template = DEMO_INVENTORY_TEMPLATES[templateId];
    // Prefix with the template's country LOCODE so that components deriving
    // country (e.g. flag rendering) from `locode.substring(0, 2)` still get
    // the correct country.
    return `${template.countryLocode} ${DEMO_LOCODE_MARKER}${templateId}-${projectId}`;
  }

  private static async importTemplateCsv(
    fileName: string,
    inventoryId: string,
    dataSourceName: string,
  ) {
    const filePath = path.join(process.cwd(), "public", fileName);
    const buffer = await readFile(filePath);
    const parsedData = await FileParserService.parseFile(buffer, "csv");

    if (!parsedData.primarySheet) {
      throw new createHttpError.BadRequest("Demo inventory template is empty");
    }

    const detectedColumns = this.detectDemoCsvColumns(
      parsedData.primarySheet.headers,
    );
    const importResult = await ECRFImportService.processECRFFile(
      parsedData,
      detectedColumns,
    );

    const importSummary = await InventoryImportService.importECRFData(
      inventoryId,
      importResult,
      { defaultActivityDataSource: dataSourceName },
    );

    if (importSummary.importedRows === 0) {
      throw new createHttpError.BadRequest(
        importSummary.errors.join("; ") || "No rows were imported",
      );
    }

    return importSummary;
  }

  private static detectDemoCsvColumns(
    headers: string[],
  ): Record<string, number> {
    const indexByHeader = new Map(
      headers.map((header, index) => [header.toLowerCase().trim(), index]),
    );
    const indexOf = (header: string) => indexByHeader.get(header.toLowerCase());

    const detectedColumns = {
      gpcRefNo: indexOf("GPC Reference Number"),
      subsector: indexOf("Subsector name"),
      notationKey: indexOf("Notation Key"),
      totalCO2e: indexOf("Total Emissions"),
      activityType: indexOf("Activity type"),
      activityAmount: indexOf("Activity Value"),
      activityUnit: indexOf("Activity Units"),
      emissionFactorUnit: indexOf("Emission Factor - Unit"),
      emissionFactorCO2: indexOf("Emission Factor - CO2"),
      emissionFactorCH4: indexOf("Emission Factor - CH4"),
      emissionFactorN2O: indexOf("Emission Factor - N2O"),
      co2: indexOf("CO2 Emissions"),
      ch4: indexOf("CH4 Emissions"),
      n2o: indexOf("N2O Emissions"),
      activityDataSource: indexOf("Data source name"),
    };

    return Object.fromEntries(
      Object.entries(detectedColumns).filter(
        ([, index]) => index !== undefined,
      ),
    ) as Record<string, number>;
  }
}
