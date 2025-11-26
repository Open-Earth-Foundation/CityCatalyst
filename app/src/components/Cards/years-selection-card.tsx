"use client";
import { api } from "@/services/api";
import { useRouter } from "next/navigation";
import React from "react";
import { TFunction } from "i18next";
import { YearSelector, YearSelectorItem } from "@/components/shared/YearSelector";

export function YearSelectorCard({
  inventories,
  cityId,
  currentInventoryId,
  lng,
  t,
}: {
  inventories: { year: number; inventoryId: string; lastUpdate: Date }[];
  cityId: string;
  currentInventoryId: string | null;
  lng: string;
  t: TFunction;
}) {
  const [setUserInfo] = api.useSetUserInfoMutation();
  const router = useRouter();

  const handleYearSelect = (yearData: YearSelectorItem) => {
    setUserInfo({ defaultInventoryId: yearData.inventoryId, defaultCityId: cityId });
    router.push(`/${yearData.inventoryId}`);
  };

  return (
    <YearSelector
      inventories={inventories}
      currentInventoryId={currentInventoryId}
      lng={lng}
      t={t}
      onYearSelect={handleYearSelect}
    />
  );
}
