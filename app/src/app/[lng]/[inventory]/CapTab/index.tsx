"use client";
import { useTranslation } from "@/i18n/client";
import { InventoryResponse } from "@/util/types";
import { Box, Tabs } from "@chakra-ui/react";
import React from "react";
import { ACTION_TYPES } from "@/app/[lng]/[inventory]/CapTab/types";
import { CapActionTab } from "@/app/[lng]/[inventory]/CapTab/CapActionTab";

interface capTabProps {
  lng: string;
  inventory: InventoryResponse;
}

const CapTab = ({ lng, inventory }: capTabProps) => {
  const { t } = useTranslation(lng, "cap");

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
            <CapActionTab type={actionType} inventory={inventory} />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </Box>
  );
};

export default CapTab;
