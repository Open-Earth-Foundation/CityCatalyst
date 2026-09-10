import Decimal from "decimal.js";
import { HIAction } from "./types";
import { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { NumberFormatEnum } from "./enums";

export function isFetchBaseQueryError(
  error: unknown,
): error is FetchBaseQueryError {
  return typeof error === "object" && error != null && "status" in error;
}

// Extracts a human-readable message from an RTK Query mutation/query rejection
// (FetchBaseQueryError | SerializedError, the type `.unwrap()` throws) or a
// plain Error, falling back to `fallback` if nothing usable is found.
export function getApiErrorMessage(error: unknown, fallback = ""): string {
  if (isFetchBaseQueryError(error)) {
    if ("error" in error && typeof error.error === "string") {
      return error.error;
    }
    const data = error.data as
      | { message?: string; error?: { message?: string } }
      | undefined;
    return data?.error?.message || data?.message || fallback;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message || fallback;
  }
  return fallback;
}

export const getTranslationFromDictionary = (
  translations: Record<string, string> | string | undefined,
  lng?: string,
): string | undefined => {
  if (!translations) {
    return undefined;
  }
  if (typeof translations === "string") {
    return translations;
  }
  if (
    typeof translations === "object" &&
    !!Object.keys(translations).length
  ) {
    return (
      (lng && translations[lng]) ||
      translations["user"] ||
      translations["en"] ||
      Object.values(translations).find((t) => !!t)
    );
  }
};

/** Extract data from a nested object using a string path or array
 * Source: https://stackoverflow.com/a/22129960
 * @param path: string separated by . or an array of keys for each nested object
 * @param obj: object to be searched
 * @param separator: key separator for path (. by default)
 */
export function resolve(
  path: string | string[],
  obj: Record<string, unknown>,
  separator: string = ".",
): { message?: string } | undefined {
  const properties = Array.isArray(path) ? path : path.split(separator);
  return properties.reduce<unknown>(
    (prev, curr) => (prev as Record<string, unknown> | undefined)?.[curr],
    obj,
  ) as { message?: string } | undefined;
}

export function formatPercent(percent: number) {
  return Math.floor(percent * 100);
}

export function getCurrentVersion(): string {
  const version = process.env.APP_VERSION!;
  return version;
}

export function shortenNumber(number: number, format?: string): string {
  let result = number;
  if (number >= 1e9) {
    result = number / 1e9; // Billion
  } else if (number >= 1e6) {
    result = number / 1e6; // Million
  } else if (number >= 1e3) {
    result = number / 1e3; // Thousand
  }

  return formatNumber(result, format, 1);
}

export function getShortenNumberUnit(number: number): string {
  if (number >= 1e9) {
    return "B"; // Billion
  } else if (number >= 1e6) {
    return "M"; // Million
  } else if (number >= 1e3) {
    return "K"; // Thousand
  } else {
    return "";
  }
}

export async function resolvePromisesSequentially(
  promises: Promise<unknown>[],
) {
  const results = [];
  for (const promise of promises) {
    results.push(await promise);
  }

  return results;
}

export function nameToI18NKey(name?: string): string {
  if (!name) {
    return "";
  }
  // remove all special characters and replace spaces with dashes
  return name
    .replaceAll(/[^\w\s-]/gi, "")
    .replaceAll(" ", "-")
    .toLowerCase();
}

export const fileEndingToMIMEType: Record<string, string> = {
  csv: "text/csv",
  json: "application/json",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.ms-excel",
  default: "application/x-binary",
};

export function base64ToFile(base64String: string, filename: string) {
  const arr = base64String.split(",");
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  const fileBlob = new Blob([u8arr], { type: mime });
  const file = new File([fileBlob], filename, { type: mime });
  return file;
}

export function appendFileToFormData(base64String: string, filename: string) {
  return base64ToFile(base64String, filename);
}

export function bytesToMB(bytes: number): string {
  return (bytes / 1048576).toFixed(2) + " MB";
}

export function groupBy<T>(
  list: T[],
  lambda: (elem: T) => string,
): Record<string, T[]> {
  return list.reduce(
    (acc, elem) => {
      const key = lambda(elem);
      acc[key] = acc[key] || [];
      acc[key].push(elem);
      return acc;
    },
    {} as Record<string, T[]>,
  );
}

export function keyBy<T>(
  list: T[],
  lambda: (elem: T) => string,
): Record<string, T> {
  return list.reduce(
    (acc, elem) => {
      const key = lambda(elem);
      acc[key] = elem;
      return acc;
    },
    {} as Record<string, T>,
  );
}

/**
 * Product display labels for GHG emissions (CC-486).
 * Input values are always kilograms (DB `co2eq` storage unit).
 */
export const EMISSIONS_CO2E_SUFFIX = "CO₂e";

export type EmissionsScaleUnit =
  | "mgCO₂e"
  | "gCO₂e"
  | "kgCO₂e"
  | "mtCO₂e"
  | "ktCO₂e"
  | "MtCO₂e"
  | "GtCO₂e"
  | "TtCO₂e";

/**
 * Pick the display scale for an absolute emissions amount in kg.
 */
export function resolveEmissionsScale(kgAbs: number): {
  scale: number;
  unit: EmissionsScaleUnit;
} {
  if (!Number.isFinite(kgAbs) || kgAbs === 0) {
    return { scale: 1, unit: "kgCO₂e" };
  }
  if (kgAbs >= 1e15) return { scale: 1e15, unit: "TtCO₂e" };
  if (kgAbs >= 1e12) return { scale: 1e12, unit: "GtCO₂e" };
  if (kgAbs >= 1e9) return { scale: 1e9, unit: "MtCO₂e" };
  if (kgAbs >= 1e6) return { scale: 1e6, unit: "ktCO₂e" };
  if (kgAbs >= 1e3) return { scale: 1e3, unit: "mtCO₂e" };
  if (kgAbs >= 1) return { scale: 1, unit: "kgCO₂e" };
  if (kgAbs >= 1e-3) return { scale: 1e-3, unit: "gCO₂e" };
  return { scale: 1e-6, unit: "mgCO₂e" };
}

function emissionsUnitForGas(
  unit: EmissionsScaleUnit,
  gas?: string | null,
): string {
  if (!gas) return unit;
  // Gas-specific totals (e.g. CO2/CH4/N2O) drop the "e" equivalence suffix.
  return unit.replace(/CO₂e$/, gas);
}

/**
 * Format an amount of emissions in kg for UI display.
 * @param totalEmissions total amount of emissions in kg
 * @returns value + full unit label (e.g. mtCO₂e). Callers must not append CO2e.
 */
export function formatEmissions(
  totalEmissions: number,
  format?: NumberFormatEnum | string,
): {
  value: string;
  unit: string;
} {
  const { scale, unit } = resolveEmissionsScale(Math.abs(totalEmissions));
  const value = formatNumber(totalEmissions / scale, format, 1);
  return { value, unit };
}

const thousandsSeparators: { [key: string]: string } = {
  [NumberFormatEnum.COMMA_AND_DOT]: ",",
  [NumberFormatEnum.DEFAULT]: ",",
  [NumberFormatEnum.DOT_AND_COMMA]: ".",
  [NumberFormatEnum.SPACE_AND_COMMA]: " ",
  [NumberFormatEnum.APOSTROPHE_AND_DOT]: "’",
};
export const decimalSeparators: { [key: string]: string } = {
  [NumberFormatEnum.DEFAULT]: ".",
  [NumberFormatEnum.COMMA_AND_DOT]: ".",
  [NumberFormatEnum.DOT_AND_COMMA]: ",",
  [NumberFormatEnum.SPACE_AND_COMMA]: ",",
  [NumberFormatEnum.APOSTROPHE_AND_DOT]: ".",
};

export function formatNumber(
  num: number,
  format?: NumberFormatEnum | string,
  maxDecimals?: number,
) {
  if (format === undefined) {
    format = NumberFormatEnum.COMMA_AND_DOT;
  }

  const thousandsSeparator = thousandsSeparators[format as string] ?? ",";
  const decimalSeparator = decimalSeparators[format as string] ?? ".";

  // temporarily remove negative sign
  const numberString = num.toString().replace(/^-/, "");
  const [integerPart, decimalPart] = numberString.split(".");

  // process integer - reverse, add separators, reverse back (since groups start at last digit)
  let groupedInteger = integerPart;
  if (integerPart.length > 3) {
    const reversedInteger = integerPart.split("").reverse().join("") ?? "";
    const groupedReversed =
      reversedInteger?.match(/.{1,3}/g)?.join(thousandsSeparator) ?? "";
    groupedInteger = groupedReversed.split("").reverse().join("");
  }

  // trim decimals if necessary
  let trimmedDecimals = decimalPart;
  if (maxDecimals !== undefined && decimalPart !== undefined) {
    trimmedDecimals = decimalPart.slice(0, maxDecimals);
  }

  // combine integer and decimal parts
  const result = trimmedDecimals
    ? `${groupedInteger}${decimalSeparator}${trimmedDecimals}`
    : groupedInteger;

  return num < 0 ? `-${result}` : result;
}

export interface PopulationEntry {
  year: number;
  population: number;
}

/// Finds entry which has the year closest to the selected inventory year
export function findClosestYear(
  populationData: PopulationEntry[] | undefined,
  year: number,
  maxYearDifference: number = 10,
): PopulationEntry | null {
  if (!populationData || populationData?.length === 0) {
    return null;
  }
  return populationData.reduce(
    (prev, curr) => {
      // don't allow years outside of range
      if (Math.abs(curr.year - year) > maxYearDifference) {
        return prev;
      }
      if (!prev) {
        return curr;
      }
      const prevDelta = Math.abs(year - prev.year);
      const currDelta = Math.abs(year - curr.year);
      return prevDelta < currDelta ? prev : curr;
    },
    null as PopulationEntry | null,
  );
}

export function findClosestYearToInventory(
  populationData: PopulationEntry[] | undefined,
  year: number,
  maxYearDifference: number = 10,
): PopulationEntry | null {
  if (!populationData || populationData.length === 0) {
    return null;
  }

  let closestEntry = null;
  let closestDistance = Infinity; // Initialize with a large number

  populationData.forEach((entry) => {
    // Ensure the entry has a valid population value
    if (entry.population !== null && entry.population !== undefined) {
      const currentDistance = Math.abs(entry.year - year);
      // Update closestEntry if the current entry is closer than the previously stored one
      if (currentDistance < closestDistance) {
        closestEntry = entry;
        closestDistance = currentDistance;
      }
    }
  });

  // After identifying the closest entry, check if it's within the allowable range
  if (closestEntry && closestDistance <= maxYearDifference) {
    return closestEntry;
  } else if (closestEntry) {
    // If no entry is within the maxYearDifference, return the closest available entry
    return closestEntry;
  }

  return null; // In case all entries are outside the maxYearDifference and no closest entry was found
}

export const getInputMethodology = (methodologyId: string) => {
  if (methodologyId?.includes("direct-measure")) return "direct-measure";
  else {
    return methodologyId;
  }
};

export function toDecimal(
  value: Decimal | string | bigint | number | undefined,
): Decimal | undefined {
  if (!value) return undefined;
  if (value instanceof Decimal) {
    return value;
  }
  if (typeof value === "bigint") {
    return new Decimal(value.toString());
  }
  return new Decimal(value);
}

/**
 * Format kg emissions as a single UI string (e.g. "1.23 mtCO₂e").
 * Prefer this for tables/charts; use formatEmissions when value and unit are styled separately.
 */
export function convertKgToTonnes(
  valueInKg: number | Decimal | bigint,
  numberFormat?: string,
  gas?: string | null,
): string {
  const kg = toDecimal(valueInKg);
  if (!kg) {
    return `0 ${emissionsUnitForGas("kgCO₂e", gas)}`;
  }

  const { scale, unit } = resolveEmissionsScale(kg.abs().toNumber());
  const formattedNumber = formatNumber(
    kg.div(scale).toNumber(),
    numberFormat,
    2,
  );
  return `${formattedNumber} ${emissionsUnitForGas(unit, gas)}`;
}

export const toKebabCase = (input: string | undefined): string => {
  return (input ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/[^\w-]+/g, "")
    .toLowerCase();
};

export const capitalizeFirstLetter = (string: string) =>
  string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();

export const convertSectorReferenceNumberToNumber = (
  referenceNumber: string,
) => {
  switch (referenceNumber) {
    case "I":
      return 1;
    case "II":
      return 2;
    case "III":
      return 3;
    case "IV":
      return 4;
    case "V":
      return 5;
    default:
      return 1;
  }
};

export const compareGpcRefNumbers = (a: string, b: string) => {
  const aSplit = a.split(".");
  const bSplit = b.split(".");

  const aSector = convertSectorReferenceNumberToNumber(aSplit[0]).toString();
  aSplit[0] = aSector.toString();
  const bSector = convertSectorReferenceNumberToNumber(bSplit[0]).toString();
  bSplit[0] = bSector.toString();

  for (let i = 0; i < Math.min(aSplit.length, bSplit.length); i++) {
    if (aSplit[i] !== bSplit[i]) {
      return parseInt(aSplit[i]) - parseInt(bSplit[i]);
    }
  }

  return 0;
};

export const sortGpcReferenceNumbers = (refNumbers: string[]): string[] => {
  return [...refNumbers].sort(compareGpcRefNumbers);
};

export const isEmptyObject = (obj: Record<string, unknown>) => {
  return Object.keys(obj).length === 0 && obj.constructor === Object;
};

export const clamp = (num: number, min: number = 0, max: number = 1) =>
  Math.min(Math.max(num, min), max);

// Helper function to get top picks - reused from ActionPlanSection
export const getTopPickActions = (actions: HIAction[]): HIAction[] => {
  const selectedActions = actions.filter((action) => action.isSelected);
  const unselectedActions = actions.filter((action) => !action.isSelected);

  const sortedSelectedActions = selectedActions.sort(
    (a, b) => (a.rank ?? 100000) - (b.rank ?? 100000),
  );
  const sortedUnselectedActions = unselectedActions.sort(
    (a, b) => (a.rank ?? 100000) - (b.rank ?? 100000),
  );

  // make sure selected actions always come first, but fall back to unselected highest-ranked actions
  return sortedSelectedActions.concat(sortedUnselectedActions).slice(0, 3);
};

/**
 * Safely extracts a parameter value from useParams(), handling both string and string[] types
 * @param param - The parameter value from useParams() (can be string | string[] | undefined)
 * @returns The parameter value as a string, or undefined if not available
 */
export const getParamValue = (
  param: string | string[] | undefined,
): string | undefined => {
  if (!param) return undefined;
  return Array.isArray(param) ? param[0] : param;
};

/**
 * Safely extracts a parameter value from useParams() with type assertion to string
 * @param param - The parameter value from useParams() (can be string | string[] | undefined)
 * @returns The parameter value as a string, throws error if not available
 */
export const getParamValueRequired = (
  param: string | string[] | undefined,
): string => {
  const value = getParamValue(param);
  if (!value) {
    throw new Error(`Required parameter is missing or undefined`);
  }
  return value;
};

export const shortSectorNameToKebabCase = (sectorName: string) => {
  return toKebabCase(sectorName.toLowerCase() + "-short");
};

export function toTranslationString(str?: string): string {
  return (
    (str ?? "")
      // Convert camelCase/PascalCase to snake_case (e.g., "StationaryEnergy" -> "Stationary_Energy")
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toLowerCase()
      // Replace spaces with underscores
      .replaceAll(" ", "_")
      // Remove any characters that aren't alphanumeric or underscores
      .replaceAll(/[^a-z\d_]/g, "")
  );
}
