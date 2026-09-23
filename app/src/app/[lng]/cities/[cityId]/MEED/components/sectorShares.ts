import type { SectorEmission } from "@/util/types";
import { SECTORS } from "@/util/constants";

export interface MeedSectorShare {
  /** GPC sector name as the inventory reports it, e.g. "transportation". */
  name: string;
  referenceNumber: string;
  /** 0..1 share of the inventory total. */
  share: number;
}

/**
 * Sector shares of an inventory total, largest first, zero-emission sectors
 * dropped. Feeds the emissions context card's bar and the ranking insights.
 */
export function sectorShares(
  bySector: SectorEmission[] | undefined,
): MeedSectorShare[] {
  if (!bySector?.length) return [];
  const total = bySector.reduce((sum, e) => sum + Number(e.co2eq), 0);
  if (total <= 0) return [];
  return bySector
    .map((e) => {
      const sector = SECTORS.find((s) => s.name === e.sectorName);
      return {
        name: e.sectorName,
        referenceNumber: sector?.referenceNumber ?? "",
        share: Number(e.co2eq) / total,
      };
    })
    .filter((s) => s.share > 0 && s.referenceNumber)
    .sort((a, b) => b.share - a.share);
}
