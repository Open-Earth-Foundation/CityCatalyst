import { BsTruck } from "react-icons/bs";
import { PiPlant, PiTrashLight } from "react-icons/pi";
import { TbBuildingCommunity } from "react-icons/tb";
import { IconBaseProps } from "react-icons";
import { LiaIndustrySolid } from "react-icons/lia";
import { SectorColors, SubSectorColors } from "@/lib/theme/custom-colors";
import { logger } from "@/services/logger";

export const maxPopulationYearDifference = 5;

export type InventoryType = "gpc_basic" | "gpc_basic_plus";

export enum InventoryTypeEnum {
  GPC_BASIC = "gpc_basic",
  GPC_BASIC_PLUS = "gpc_basic_plus",
}

export interface ISector {
  id: string; // id from DB
  number: number;
  referenceNumber: string;
  icon: React.ElementType<IconBaseProps>;
  description: string;
  name: string;
  testId: string;
  inventoryTypes: {
    [InventoryTypeEnum.GPC_BASIC]: {
      scopes: number[];
    };
    [InventoryTypeEnum.GPC_BASIC_PLUS]: {
      scopes: number[];
    };
  };
  color: string;
  subSectors?: {
    [referenceNumber: string]: {
      name: string;
      color: string;
      referenceNumber: string;
    };
  };
}

export const getSectorsForInventory = (inventoryType?: InventoryType) => {
  if (!inventoryType) return [];
  return SECTORS.filter((sector) => {
    const scopesForInventoryType =
      sector.inventoryTypes[inventoryType as InventoryType];
    return scopesForInventoryType?.scopes.length > 0;
  });
};

function findBy(field: keyof ISector, referenceNumber: string) {
  return SECTORS.find((s) => s[field] === referenceNumber);
}

export const getScopesForInventoryAndSector = (
  inventoryType: InventoryType,
  referenceNumber: string,
) => {
  if (!inventoryType) return [];
  const sector = findBy("referenceNumber", referenceNumber);
  if (!sector) {
    logger.error(
      `Sector ${referenceNumber} for inventoryType ${inventoryType} not found`,
    );
    return [];
  }
  return sector.inventoryTypes[inventoryType].scopes;
};

export const SECTORS: ISector[] = [
  {
    id: "5da765a9-1ca6-37e1-bcd6-7b387f909a4e",
    referenceNumber: "I",
    number: 1,
    name: "stationary-energy",
    description: "stationary-energy-description",
    icon: TbBuildingCommunity,
    color: SectorColors.I,
    inventoryTypes: {
      [InventoryTypeEnum.GPC_BASIC]: { scopes: [1, 2] },
      [InventoryTypeEnum.GPC_BASIC_PLUS]: { scopes: [1, 2, 3] },
    },
    testId: "stationary-energy-sector-card",
  },
  {
    id: "73eb7b71-159c-3eda-b7fc-f6eb53754dc3",
    referenceNumber: "II",
    number: 2,
    name: "transportation",
    description: "transportation-description",
    icon: BsTruck,
    color: SectorColors.II,
    inventoryTypes: {
      [InventoryTypeEnum.GPC_BASIC]: { scopes: [1, 2] },
      [InventoryTypeEnum.GPC_BASIC_PLUS]: { scopes: [1, 2, 3] },
    },
    testId: "transportation-sector-card",
  },
  {
    id: "d5acb72e-d915-310f-b3a3-77f634bcbf5e",
    referenceNumber: "III",
    number: 3,
    name: "waste",
    description: "waste-description",
    icon: PiTrashLight,
    color: SectorColors.III,
    inventoryTypes: {
      [InventoryTypeEnum.GPC_BASIC]: { scopes: [1, 3] },
      [InventoryTypeEnum.GPC_BASIC_PLUS]: { scopes: [1, 3] },
    },
    testId: "waste-sector-card",
  },
  {
    id: "6e986105-3df9-30de-8997-041d93537278",
    referenceNumber: "IV",
    number: 4,
    name: "ippu",
    description: "ippu-description",
    icon: LiaIndustrySolid,
    color: SectorColors.IV,
    testId: "ippu-sector-card",
    inventoryTypes: {
      [InventoryTypeEnum.GPC_BASIC]: { scopes: [] },
      [InventoryTypeEnum.GPC_BASIC_PLUS]: { scopes: [1] },
    },
  },
  {
    id: "b7845aa4-e50b-3b8c-8941-77d098a73e82",
    referenceNumber: "V",
    number: 5,
    name: "afolu",
    description: "afolu-description",
    icon: PiPlant,
    color: SectorColors.V,
    testId: "afolu-sector-card",
    inventoryTypes: {
      [InventoryTypeEnum.GPC_BASIC]: { scopes: [] },
      [InventoryTypeEnum.GPC_BASIC_PLUS]: { scopes: [1] },
    },
    subSectors: {
      "V.1": {
        referenceNumber: "V.1",
        name: "afolu-livestock",
        color: SubSectorColors["V.1"],
      },
      "V.2": {
        referenceNumber: "V.2",
        name: "afolu-land",
        color: SubSectorColors["V.2"],
      },
      "V.3": {
        referenceNumber: "V.3",
        name: "afolu-other-agriculture",
        color: SubSectorColors["V.3"],
      },
    },
  },
];

export const allSectorColors = SECTORS.map((sector) => {
  return sector.color;
});
export const getSectorByName = (name: string) =>
  SECTORS.find((s) => s.name === name);

export const getSubSectorByName = (name: string) => {
  for (const sector of SECTORS) {
    if (sector.subSectors) {
      for (const subSector of Object.values(sector.subSectors)) {
        if (subSector.name === name) {
          return subSector;
        }
      }
    }
  }
  return undefined;
};

export const getReferenceNumberByName = (name: keyof ISector) =>
  findBy("name", name)?.referenceNumber;

export const getSectorByReferenceNumber = (referenceNumber: string) =>
  findBy("referenceNumber", referenceNumber);

export const getSubSectorByReferenceNumber = (referenceNumber: string) => {
  const [sectorRefNum] = referenceNumber.split(".");
  const sector = getSectorByReferenceNumber(sectorRefNum);
  return sector?.subSectors?.[referenceNumber];
};

export const REGIONALLOCALES: Record<string, string> = {
  es: "es-ES", // Spanish (Spain)
  en: "en-US", // English (United States)
  pt: "pt-PT", // Portuguese (Portugal)
  de: "de-DE", // German (Germany)
};

export const DEFAULT_PROJECT_ID = "ebe82f61-b51b-4015-90ef-8b94f86fb0b7";
