import { MethodologyBySector } from "./types";
import { STATIONARY_ENERGY } from "./methodologies-stationary-energy";
import { WASTE } from "./methodologies-waste";
import { MULTIPLE } from "./methodologies-multiple";
import { TRANSPORT } from "./methodologies-transport";

export const methodologiesBySector: MethodologyBySector[] = [
  STATIONARY_ENERGY,
  TRANSPORT,
  WASTE,
  {
    sector: "ippu",
    sector_roman_numeral: "IV",
    methodologies: [],
  },
  {
    sector: "afolu",
    sector_roman_numeral: "V",
    methodologies: [],
  },
  MULTIPLE,
];
