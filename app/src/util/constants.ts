import { BsTruck } from "react-icons/bs";
import { PiTrashLight } from "react-icons/pi";
import {
  TbBuildingCommunity,
  TbBuildingFactory2,
  TbPlant2,
} from "react-icons/tb";

export const maxPopulationYearDifference = 5;

export type InventoryType = "gpc_basic" | "gpc_basic_plus";
export enum InventoryTypeEnum {
  GPC_BASIC = "gpc_basic",
  GPC_BASIC_PLUS = "gpc_basic_plus",
}

export interface ISector {
  number: number;
  referenceNumber: string;
  icon: React.ElementType;
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
}

export const getSectorsForInventory = (inventoryType: InventoryType) =>
  SECTORS.filter((sector) => {
    const scopesForInventoryType =
      sector.inventoryTypes[inventoryType as InventoryType];
    return scopesForInventoryType?.scopes.length > 0;
  });

export const SECTORS: ISector[] = [
  {
    referenceNumber: "I",
    number: 1,
    name: "stationary-energy",
    description: "stationary-energy-description",
    icon: TbBuildingCommunity,
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
    icon: TbBuildingFactory2,
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
    icon: TbPlant2,
    testId: "afolu-sector-card",
    inventoryTypes: {
      [InventoryTypeEnum.GPC_BASIC]: { scopes: [] },
      [InventoryTypeEnum.GPC_BASIC_PLUS]: { scopes: [1] },
    },
  },
];
