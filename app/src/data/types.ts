import { BsTruck } from "react-icons/bs";
import { PiTrashLight } from "react-icons/pi";
import {
  TbBuildingCommunity,
  TbBuildingFactory2,
  TbPlant2,
} from "react-icons/tb";

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
  inventoryTypes: {
    [InventoryTypeEnum.GPC_BASIC]: {
      scopes: number[];
    };
    [InventoryTypeEnum.GPC_BASIC_PLUS]: {
      scopes: number[];
    };
  };
}

export const sectors: ISector[] = [
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
  },
  {
    referenceNumber: "III",
    number: 3,
    name: "waste",
    description: "waste-and-wastewater-description",
    icon: PiTrashLight,
    inventoryTypes: {
      [InventoryTypeEnum.GPC_BASIC]: { scopes: [1, 3] },
      [InventoryTypeEnum.GPC_BASIC_PLUS]: { scopes: [1, 3] },
    },
  },
  {
    referenceNumber: "IV",
    number: 4,
    name: "IPPU",
    description: "IPPU-description",
    icon: TbBuildingFactory2,
    inventoryTypes: {
      [InventoryTypeEnum.GPC_BASIC]: { scopes: [] },
      [InventoryTypeEnum.GPC_BASIC_PLUS]: { scopes: [1] },
    },
  },
  {
    referenceNumber: "V",
    number: 5,
    name: "AFOLU",
    description: "AFOLU-description",
    icon: TbPlant2,
    inventoryTypes: {
      [InventoryTypeEnum.GPC_BASIC]: { scopes: [] },
      [InventoryTypeEnum.GPC_BASIC_PLUS]: { scopes: [1] },
    },
  },
];
