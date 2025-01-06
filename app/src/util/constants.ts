import { BsTruck } from "react-icons/bs";
import { PiPlant, PiTrashLight } from "react-icons/pi";
import { TbBuildingCommunity } from "react-icons/tb";
import { IconBaseProps } from "react-icons";
import { LiaIndustrySolid } from "react-icons/lia";
import { appTheme } from "@/lib/app-theme"; // Import the appTheme

export const maxPopulationYearDifference = 5;

export type InventoryType = "gpc_basic" | "gpc_basic_plus";

export enum InventoryTypeEnum {
  GPC_BASIC = "gpc_basic",
  GPC_BASIC_PLUS = "gpc_basic_plus",
}

export interface ISector {
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
    console.error(
      `Sector ${referenceNumber} for inventoryType ${inventoryType} not found`,
    );
    return [];
  }
  return sector.inventoryTypes[inventoryType].scopes;
};

export const SECTORS: ISector[] = [
  {
    referenceNumber: "I",
    number: 1,
    name: "stationary-energy",
    description: "stationary-energy-description",
    icon: TbBuildingCommunity,
    color: appTheme.colors.sectors["stationary-energy"],
    inventoryTypes: {
      [InventoryTypeEnum.GPC_BASIC]: { scopes: [1, 2] },
      [InventoryTypeEnum.GPC_BASIC_PLUS]: { scopes: [1, 2, 3] },
    },
    testId: "stationary-energy-sector-card",
  },
  {
    referenceNumber: "II",
    number: 2,
    name: "transportation",
    description: "transportation-description",
    icon: BsTruck,
    color: appTheme.colors.sectors["transportation"],
    inventoryTypes: {
      [InventoryTypeEnum.GPC_BASIC]: { scopes: [1, 2] },
      [InventoryTypeEnum.GPC_BASIC_PLUS]: { scopes: [1, 2, 3] },
    },
    testId: "transportation-sector-card",
  },
  {
    referenceNumber: "III",
    number: 3,
    name: "waste",
    description: "waste-description",
    icon: PiTrashLight,
    color: appTheme.colors.sectors["waste"],
    inventoryTypes: {
      [InventoryTypeEnum.GPC_BASIC]: { scopes: [1, 3] },
      [InventoryTypeEnum.GPC_BASIC_PLUS]: { scopes: [1, 3] },
    },
    testId: "waste-sector-card",
  },
  {
    referenceNumber: "IV",
    number: 4,
    name: "ippu",
    description: "ippu-description",
    icon: LiaIndustrySolid,
    color: appTheme.colors.sectors["ippu"],
    testId: "ippu-sector-card",
    inventoryTypes: {
      [InventoryTypeEnum.GPC_BASIC]: { scopes: [] },
      [InventoryTypeEnum.GPC_BASIC_PLUS]: { scopes: [1] },
    },
  },
  {
    referenceNumber: "V",
    number: 5,
    name: "afolu",
    description: "afolu-description",
    icon: PiPlant,
    color: appTheme.colors.sectors["afolu"],
    testId: "afolu-sector-card",
    inventoryTypes: {
      [InventoryTypeEnum.GPC_BASIC]: { scopes: [] },
      [InventoryTypeEnum.GPC_BASIC_PLUS]: { scopes: [1] },
    },
  },
];

export const allSectorColors = SECTORS.map((sector) => sector.color);
export const getSectorByName = (name: string) =>
  SECTORS.find((s) => s.name === name);

export const getReferenceNumberByName = (name: keyof ISector) =>
  findBy("name", name)?.referenceNumber;
