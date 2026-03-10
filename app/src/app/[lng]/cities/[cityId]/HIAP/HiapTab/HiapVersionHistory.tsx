"use client";

import { groupInventoryHistory } from "@/app/[lng]/[inventory]/InventoryVersionsTab/history-helpers";
import VersionEntry from "@/app/[lng]/[inventory]/InventoryVersionsTab/VersionEntry";
import ProgressLoader from "@/components/ProgressLoader";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import { Text, VStack } from "@chakra-ui/react";

export default function HiapVersionHistory({
  inventoryId,
  lng,
}: {
  lng: string;
  inventoryId: string;
}) {
  const { t } = useTranslation(lng, "dashboard");
  const { t: tData } = useTranslation(lng, "data");

  const { data, isLoading } = api.useGetVersionHistoryQuery({
    inventoryId,
    moduleName: "hiap",
  });

  const groupedVersions = groupInventoryHistory(data);

  return (
    <VStack alignItems="start" gap={4} mt={1}>
      {inventoryId}

      {isLoading && <ProgressLoader />}
      {data != null &&
        (data?.length === 0 ? (
          <Text>{t("no-history")}</Text>
        ) : (
          groupedVersions.map((entries, i) => (
            <VersionEntry
              key={i}
              t={t}
              tData={tData}
              versionEntries={entries}
              isCurrent={i === 0}
              versionNumber={groupedVersions.length - i - 1}
              moduleName="hiap"
            />
          ))
        ))}
    </VStack>
  );
}
