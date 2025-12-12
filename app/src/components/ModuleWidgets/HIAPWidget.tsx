import React, { useState, useMemo } from "react";
import { Box, Text, HStack, Tabs, Icon } from "@chakra-ui/react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/i18n/client";
import { ACTION_TYPES, HIAction } from "@/util/types";
import { ClimateActionCard } from "@/components/ClimateActionCard";
import { ActionDrawer } from "@/components/ActionDrawer";
import { HeadlineSmall } from "@/components/package/Texts/Headline";
import { Button } from "../ui/button";
import { MdOpenInNew } from "react-icons/md";
import { useRouter } from "next/navigation";
import { AdaptationTabIcon, MitigationTabIcon } from "../icons";
import { useGetCityHIAPDashboardQuery } from "@/services/api";
import { getTopPickActions } from "@/util/helpers";
import { useLatestInventory } from "@/hooks/use-latest-inventory";

interface HIAPWidgetProps {
  cityId: string;
  lng: string;
  onVisibilityChange?: (hasContent: boolean) => void;
  isPublic?: boolean;
  year?: number;
  hiapData?: any; // Pre-fetched HIAP dashboard data
  inventories?: any[]; // Pre-fetched inventories
}

export const HIAPWidget: React.FC<HIAPWidgetProps> = ({
  cityId,
  lng,
  onVisibilityChange,
  isPublic = false,
  year,
  hiapData: preFetchedHiapData,
  inventories: preFetchedInventories,
}) => {
  const { t } = useTranslation(lng, "hiap");
  const router = useRouter();
  const [actionType, setActionType] = useState<ACTION_TYPES>(
    ACTION_TYPES.Mitigation,
  );
  const [selectedAction, setSelectedAction] = useState<HIAction | null>(null);

  // Use pre-fetched inventories if available, otherwise fetch
  const { inventoryId, isLoading: isInventoryLoading } = useLatestInventory({
    cityId,
    isPublic,
    year,
    preFetchedInventories, // Pass pre-fetched inventories to skip API calls
  });

  // Use inventoryId from hook (it will use pre-fetched data if available)
  const finalInventoryId = inventoryId;

  // Fetch HIAP dashboard data only if not provided (fallback for direct widget access)
  const {
    data: fetchedHiapData,
    isLoading: isHiapLoading,
    error,
  } = useGetCityHIAPDashboardQuery(
    { cityId, inventoryId: finalInventoryId!, lng },
    {
      skip: !finalInventoryId || !!preFetchedHiapData, // Skip if pre-fetched data is available
    },
  );

  // Use pre-fetched data if available, otherwise use fetched data
  const hiapData = preFetchedHiapData || fetchedHiapData;

  const isLoading = isInventoryLoading || isHiapLoading;

  // Calculate topPickActions whenever actionType or data changes
  const topPickActions = useMemo(() => {
    const actions = hiapData?.[actionType]?.rankedActions || [];
    return getTopPickActions(actions);
  }, [actionType, hiapData]);

  const hasContent: boolean =
    !!hiapData && hiapData?.[actionType]?.rankedActions?.length > 0;

  React.useEffect(() => {
    if (!isLoading) {
      onVisibilityChange?.(hasContent);
    }
  }, [hasContent, isLoading, onVisibilityChange]);

  if (isLoading) {
    return (
      <Box w="full" p="24px">
        <Skeleton height="300px" borderRadius="8px" />
      </Box>
    );
  }

  if (error || !hasContent) {
    return null;
  }

  return (
    <>
      {selectedAction && (
        <ActionDrawer
          action={selectedAction}
          isOpen={!!selectedAction}
          onClose={() => setSelectedAction(null)}
          t={t}
          lng={lng}
        />
      )}
      <Box w="full">
        <HStack justifyContent="space-between" mb={2}>
          <Text color="content.link">{t("actions")}</Text>
          {!isPublic && (
            <Button
              onClick={() => {
                router.push(`/cities/${cityId}/HIAP`);
              }}
              variant="outline"
              borderColor="border.neutral"
              color="content.primary"
            >
              <Text>{t("open-cc-actions")}</Text>
              <MdOpenInNew />
            </Button>
          )}
        </HStack>
        <HeadlineSmall>{t("top-climate-actions")}</HeadlineSmall>
        <Text fontSize="body.md" color="content.tertiary" mt="8px" mb={10}>
          {t("top-actions-for-your-city-description")}
        </Text>
      </Box>
      <Box>
        <Tabs.Root
          variant="line"
          lazyMount
          value={actionType}
          onValueChange={(details) =>
            setActionType(details.value as ACTION_TYPES)
          }
        >
          <Tabs.List>
            {Object.values(ACTION_TYPES).map((type) => (
              <Tabs.Trigger
                key={type}
                value={type}
                color="interactive.control"
                display="flex"
                gap="16px"
                _selected={{
                  color: "interactive.secondary",
                  fontFamily: "heading",
                  fontWeight: "bold",
                }}
              >
                <Icon
                  as={
                    type === ACTION_TYPES.Mitigation
                      ? MitigationTabIcon
                      : AdaptationTabIcon
                  }
                />
                {t(`action-type-${type}`)}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {Object.values(ACTION_TYPES).map((type) => (
            <Tabs.Content key={type} value={type} mt={10} p="0" w="full">
              <Box
                display="grid"
                gridTemplateColumns="repeat(auto-fit, minmax(280px, 1fr))"
                gap="24px"
              >
                {topPickActions.map((action) => (
                  <ClimateActionCard
                    key={action.id}
                    viewOnly
                    action={action}
                    t={t}
                    onSeeMoreClick={() => setSelectedAction(action)}
                  />
                ))}
              </Box>
            </Tabs.Content>
          ))}
        </Tabs.Root>
      </Box>
    </>
  );
};
