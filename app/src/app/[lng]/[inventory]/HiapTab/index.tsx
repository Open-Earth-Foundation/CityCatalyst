"use client";
import { useTranslation } from "@/i18n/client";
import { InventoryResponse } from "@/util/types";
import { Box, Tabs } from "@chakra-ui/react";
import React from "react";
import { ACTION_TYPES } from "@/util/types";
import { HiapTab } from "@/app/[lng]/[inventory]/HiapTab/HiapTab";

interface HiapTabWrapperProps {
  lng: string;
  inventory: InventoryResponse;
}

const HiapTabWrapper = ({ lng, inventory }: HiapTabWrapperProps) => {
  const { t } = useTranslation(lng, "hiap");

  return (
    <Box>
      <Tabs.Root variant="line" lazyMount defaultValue={ACTION_TYPES.Mitigation}>
        <Tabs.List>
          {Object.values(ACTION_TYPES).map((actionType) => (
            <Tabs.Trigger key={actionType} value={actionType}>
              {t(`action-type-${actionType}`)}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {Object.values(ACTION_TYPES).map((actionType) => (
          <Tabs.Content key={actionType} value={actionType}>
            <HiapTab type={actionType} inventory={inventory} />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </Box>
  );
};

export default HiapTabWrapper;
