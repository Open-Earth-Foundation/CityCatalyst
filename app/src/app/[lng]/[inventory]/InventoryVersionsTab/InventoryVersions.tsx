"use client";

import ProgressLoader from "@/components/ProgressLoader";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import { Heading, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import { MdRestore } from "react-icons/md";
import VersionEntry from "./VersionEntry";
import { groupInventoryHistory } from "./history-helpers";

export default function InventoryVersions({
  lng,
  inventoryId,
}: {
  lng: string;
  inventoryId?: string;
}) {
  const { t } = useTranslation(lng, "dashboard");
  const { t: tData } = useTranslation(lng, "data");

  const { data, isLoading } = api.useGetVersionHistoryQuery(
    { inventoryId: inventoryId! },
    { skip: !inventoryId },
  );
  const groupedVersions = groupInventoryHistory(data);

  return (
    <VStack alignItems="start" gap={4} mt={1}>
      <HStack gap={4} mb={4}>
        <Icon as={MdRestore} boxSize="32px" color="interactive.secondary" />
        <VStack gap={4} w="full" alignItems="start">
          <Heading fontSize="headline.sm" fontWeight="semibold" lineHeight="32">
            {t("inventory-versions-title")}
          </Heading>
          <Text
            fontWeight="regular"
            fontSize="body.lg"
            color="interactive.control"
            letterSpacing="wide"
          >
            {t("inventory-versions-description")}
          </Text>
        </VStack>
      </HStack>
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
            />
          ))
        ))}
    </VStack>
  );
}
