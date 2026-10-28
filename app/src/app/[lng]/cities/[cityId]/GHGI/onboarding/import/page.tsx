"use client";

import { use, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import GhgiImportWizard from "@/components/steps/GHGI/import/ghgi-import-wizard";

/**
 * Standalone import entry (e.g. city onboarding still deep-links here).
 * GHGI upload mode embeds the same wizard inside setup for a continuous 5-step bar.
 */
export default function ImportPage(props: {
  params: Promise<{ lng: string; cityId: string }>;
}) {
  const { lng, cityId } = use(props.params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const inventoryId = searchParams.get("inventory");

  useEffect(() => {
    if (!inventoryId) {
      router.replace(`/${lng}/cities/${cityId}/GHGI/onboarding`);
    }
  }, [inventoryId, router, lng, cityId]);

  if (!inventoryId) {
    return null;
  }

  return (
    <GhgiImportWizard
      lng={lng}
      cityId={cityId}
      inventoryId={inventoryId}
      onComplete={(id) => {
        router.push(`/${lng}/cities/${cityId}/GHGI/${id}`);
      }}
    />
  );
}
