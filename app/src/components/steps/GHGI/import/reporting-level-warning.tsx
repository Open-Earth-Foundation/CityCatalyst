"use client";

import { TFunction } from "i18next";
import { Box, Icon, Text } from "@chakra-ui/react";
import { MdWarning } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import { api } from "@/services/api";
import { InventoryTypeEnum } from "@/util/enums";

interface ReportingLevelWarningProps {
  t: TFunction;
  inventoryId: string;
  references: string[];
  onSwitched: () => void;
}

/**
 * Warns that some file rows are outside GPC BASIC, so they will be stored but
 * not counted, and lets the user switch the inventory to GPC BASIC+ instead.
 */
export default function ReportingLevelWarning({
  t,
  inventoryId,
  references,
  onSwitched,
}: ReportingLevelWarningProps) {
  const { data: inventory } = api.useGetInventoryQuery(inventoryId, {
    skip: !inventoryId,
  });
  const [updateInventory, { isLoading }] = api.useUpdateInventoryMutation();

  if (
    references.length === 0 ||
    inventory?.inventoryType !== InventoryTypeEnum.GPC_BASIC
  ) {
    return null;
  }

  const switchToBasicPlus = async () => {
    try {
      await updateInventory({
        inventoryId,
        data: {
          inventoryName: inventory.inventoryName!,
          year: inventory.year!,
          inventoryType: InventoryTypeEnum.GPC_BASIC_PLUS,
          globalWarmingPotentialType: inventory.globalWarmingPotentialType!,
        },
      }).unwrap();
      UseSuccessToast({
        title: t("switched-to-basic-plus"),
      }).showSuccessToast();
      onSwitched();
    } catch {
      UseErrorToast({
        title: t("switch-to-basic-plus-failed"),
      }).showErrorToast();
    }
  };

  return (
    <Box
      bg="sentiment.warningOverlay"
      border="1px solid"
      borderColor="sentiment.warningDefault"
      borderRadius="md"
      p={4}
      mb={6}
      display="flex"
      alignItems="flex-start"
      gap="12px"
      data-testid="reporting-level-warning"
    >
      <Icon
        as={MdWarning}
        boxSize={5}
        color="sentiment.warningDefault"
        mt="2px"
        flexShrink={0}
      />
      <Box flex={1}>
        <Text
          fontWeight="semibold"
          color="sentiment.warningDefault"
          fontSize="body.md"
        >
          {t("rows-outside-basic-title", { count: references.length })}
        </Text>
        <Text fontSize="body.sm" color="content.secondary" mt={1}>
          {t("rows-outside-basic-description", {
            references: references.join(", "),
          })}
        </Text>
        <Text fontSize="body.sm" color="content.secondary" mt={1}>
          {t("rows-outside-basic-switch-hint")}
        </Text>
        <Button
          mt={3}
          size="sm"
          variant="outline"
          loading={isLoading}
          onClick={switchToBasicPlus}
        >
          {t("switch-to-basic-plus")}
        </Button>
      </Box>
    </Box>
  );
}
