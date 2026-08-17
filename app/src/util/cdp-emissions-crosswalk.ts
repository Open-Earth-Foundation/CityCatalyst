/**
 * GPC reference numbers mapped to CDP emissions-matrix questionnaire rows.
 * Used by POST /api/v1/inventory/[inventory]/cdp to aggregate InventoryValue.co2eq.
 *
 * Named once per GPC sector + scope. Aggregate rows are unions of these groups
 * so they cannot silently drift (CC-662: Transportation scope 3 was I.*.3).
 */

export type CdpEmissionsRow = {
  rowRegex: RegExp;
  refNos: string[];
};

const STATIONARY_SCOPE1 = [
  "I.1.1",
  "I.2.1",
  "I.3.1",
  "I.4.1",
  "I.5.1",
  "I.6.1",
  "I.7.1",
  "I.8.1",
];
const STATIONARY_SCOPE1_GENERATION = ["I.4.4"];
const STATIONARY_SCOPE2 = [
  "I.1.2",
  "I.2.2",
  "I.3.2",
  "I.4.2",
  "I.5.2",
  "I.6.2",
];
const STATIONARY_SCOPE3 = [
  "I.1.3",
  "I.2.3",
  "I.3.3",
  "I.4.3",
  "I.5.3",
  "I.6.3",
];

const TRANSPORT_SCOPE1 = ["II.1.1", "II.2.1", "II.3.1", "II.4.1", "II.5.1"];
const TRANSPORT_SCOPE2 = ["II.1.2", "II.2.2", "II.3.2", "II.4.2", "II.5.2"];
/** No off-road II.5.3 in the CDP transport scope 3 row. */
const TRANSPORT_SCOPE3 = ["II.1.3", "II.2.3", "II.3.3", "II.4.3"];

const WASTE_WITHIN_SCOPE1 = ["III.1.1", "III.2.1", "III.3.1", "III.4.1"];
const WASTE_WITHIN_SCOPE3 = ["III.1.2", "III.2.2", "III.3.2", "III.4.2"];
const WASTE_OUTSIDE_SCOPE1 = ["III.1.3", "III.2.3", "III.3.3", "III.4.3"];

export const cdpEmissionsRows: CdpEmissionsRow[] = [
  {
    rowRegex: /Total scope 1 emissions.*excluding/,
    refNos: [
      ...STATIONARY_SCOPE1,
      ...TRANSPORT_SCOPE1,
      ...WASTE_WITHIN_SCOPE1,
      ...WASTE_OUTSIDE_SCOPE1,
    ],
  },
  {
    rowRegex: /[Ss]cope 1 emissions.*from generation/,
    refNos: STATIONARY_SCOPE1_GENERATION,
  },
  {
    rowRegex: /Total scope 2 emissions/,
    refNos: [...STATIONARY_SCOPE2, ...TRANSPORT_SCOPE2],
  },
  {
    rowRegex: /Total scope 3 emissions/,
    refNos: [...STATIONARY_SCOPE3, ...TRANSPORT_SCOPE3, ...WASTE_WITHIN_SCOPE3],
  },
  {
    rowRegex: /Stationary Energy.*scope 1/,
    refNos: [...STATIONARY_SCOPE1, ...STATIONARY_SCOPE1_GENERATION],
  },
  {
    rowRegex: /Stationary Energy.*scope 2/,
    refNos: STATIONARY_SCOPE2,
  },
  {
    rowRegex: /Stationary Energy.*scope 3/,
    refNos: STATIONARY_SCOPE3,
  },
  {
    rowRegex: /Transportation.*scope 1/,
    refNos: TRANSPORT_SCOPE1,
  },
  {
    rowRegex: /Transportation.*scope 2/,
    refNos: TRANSPORT_SCOPE2,
  },
  {
    rowRegex: /Transportation.*scope 3/,
    refNos: TRANSPORT_SCOPE3,
  },
  {
    rowRegex: /Waste.*within.*scope 1/,
    refNos: WASTE_WITHIN_SCOPE1,
  },
  {
    rowRegex: /Waste.*within.*scope 3/,
    refNos: WASTE_WITHIN_SCOPE3,
  },
  {
    rowRegex: /Waste.*outside.*scope 1/,
    refNos: WASTE_OUTSIDE_SCOPE1,
  },
  {
    rowRegex: /TOTAL BASIC emissions/,
    // Excludes I.4.4 generation and waste-outside codes (CDP BASIC definition).
    refNos: [
      ...STATIONARY_SCOPE1,
      ...TRANSPORT_SCOPE1,
      ...WASTE_WITHIN_SCOPE1,
      ...STATIONARY_SCOPE2,
      ...TRANSPORT_SCOPE2,
      ...WASTE_WITHIN_SCOPE3,
    ],
  },
];

/** Find the crosswalk entry whose regex matches a CDP matrix row title. */
export function findCdpEmissionsRow(
  rowTitle: string,
): CdpEmissionsRow | undefined {
  return cdpEmissionsRows.find((row) => row.rowRegex.test(rowTitle));
}
