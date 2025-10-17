"use client";
import { PopulationAttributes } from "@/models/Population";
import { InventoryResponse } from "@/util/types";
import ReportResults from "@/components/GHGI/ReportResults";

export default function InventoryResultTab({
  lng,
  inventory,
  isPublic,
  population,
}: {
  lng: string;
  inventory?: InventoryResponse;
  population?: PopulationAttributes;
  isPublic: boolean;
}) {
  return (
    <ReportResults
      lng={lng}
      inventory={inventory}
      isPublic={isPublic}
      population={population}
    />
  );
}
