/**
 * GPC reference numbers mapped to CDP emissions-matrix questionnaire rows.
 * Used by POST /api/v1/inventory/[inventory]/cdp to aggregate InventoryValue.co2eq.
 */
export type CdpEmissionsRow = {
  rowRegex: RegExp;
  refNos: string[];
};

export const cdpEmissionsRows: CdpEmissionsRow[] = [
  {
    rowRegex: /Total scope 1 emissions.*excluding/,
    // prettier-ignore
    refNos: [
      "I.1.1", "I.2.1", "I.3.1", "I.4.1", "I.5.1", "I.6.1", "I.7.1", "I.8.1",
      "II.1.1", "II.2.1", "II.3.1", "II.4.1", "II.5.1",
      "III.1.1", "III.2.1", "III.3.1", "III.4.1", "III.1.3", "III.2.3", "III.3.3", "III.4.3"
    ],
  },
  {
    rowRegex: /[Ss]cope 1 emissions.*from generation/,
    refNos: ["I.4.4"],
  },
  {
    rowRegex: /Total scope 2 emissions/,
    // prettier-ignore
    refNos: ["I.1.2", "I.2.2", "I.3.2", "I.4.2", "I.5.2", "I.6.2", "II.1.2", "II.2.2", "II.3.2", "II.4.2", "II.5.2"],
  },
  {
    rowRegex: /Total scope 3 emissions/,
    // prettier-ignore
    refNos: [
      "I.1.3", "I.2.3", "I.3.3", "I.4.3", "I.5.3", "I.6.3",
      "II.1.3", "II.2.3", "II.3.3", "II.4.3",
      "III.1.2", "III.2.2", "III.3.2", "III.4.2"
    ],
  },
  {
    rowRegex: /Stationary Energy.*scope 1/,
    // prettier-ignore
    refNos: ["I.1.1", "I.2.1", "I.3.1", "I.4.1", "I.5.1", "I.6.1", "I.7.1", "I.8.1", "I.4.4"],
  },
  {
    rowRegex: /Stationary Energy.*scope 2/,
    refNos: ["I.1.2", "I.2.2", "I.3.2", "I.4.2", "I.5.2", "I.6.2"],
  },
  {
    rowRegex: /Stationary Energy.*scope 3/,
    refNos: ["I.1.3", "I.2.3", "I.3.3", "I.4.3", "I.5.3", "I.6.3"],
  },
  {
    rowRegex: /Transportation.*scope 1/,
    refNos: ["II.1.1", "II.2.1", "II.3.1", "II.4.1", "II.5.1"],
  },
  {
    rowRegex: /Transportation.*scope 2/,
    refNos: ["II.1.2", "II.2.2", "II.3.2", "II.4.2", "II.5.2"],
  },
  {
    // Transport scope 3 must use II.*.3 — not stationary I.*.3 (CC-662).
    rowRegex: /Transportation.*scope 3/,
    refNos: ["II.1.3", "II.2.3", "II.3.3", "II.4.3"],
  },
  {
    rowRegex: /Waste.*within.*scope 1/,
    refNos: ["III.1.1", "III.2.1", "III.3.1", "III.4.1"],
  },
  {
    rowRegex: /Waste.*within.*scope 3/,
    refNos: ["III.1.2", "III.2.2", "III.3.2", "III.4.2"],
  },
  {
    rowRegex: /Waste.*outside.*scope 1/,
    refNos: ["III.1.3", "III.2.3", "III.3.3", "III.4.3"],
  },
  {
    rowRegex: /TOTAL BASIC emissions/,
    // prettier-ignore
    refNos: [
      "I.1.1", "I.2.1", "I.3.1", "I.4.1", "I.5.1", "I.6.1", "I.7.1", "I.8.1",
      "II.1.1", "II.2.1", "II.3.1", "II.4.1", "II.5.1",
      "III.1.1", "III.2.1", "III.3.1", "III.4.1",
      "I.1.2", "I.2.2", "I.3.2", "I.4.2", "I.5.2", "I.6.2",
      "II.1.2", "II.2.2", "II.3.2", "II.4.2", "II.5.2",
      "III.1.2", "III.2.2", "III.3.2", "III.4.2"
    ],
  },
];

/** Find the crosswalk entry whose regex matches a CDP matrix row title. */
export function findCdpEmissionsRow(
  rowTitle: string,
): CdpEmissionsRow | undefined {
  return cdpEmissionsRows.find((row) => row.rowRegex.test(rowTitle));
}
