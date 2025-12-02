"use client";
import React, { useEffect, useState } from "react";
import { Box, Button, Icon } from "@chakra-ui/react";
import { LuRefreshCw } from "react-icons/lu";
import { MdOutlineInfo } from "react-icons/md";
import {
  HIAction,
  HIAPResponse,
  InventoryResponse,
  ACTION_TYPES,
  LANGUAGES,
} from "@/util/types";
import { ButtonMedium } from "@/components/package/Texts/Button";
import { HeadlineSmall } from "@/components/package/Texts/Headline";
import { BodyLarge } from "@/components/package/Texts/Body";
import { TitleSmall } from "@/components/package/Texts/Title";
import { logger } from "@/services/logger";
import { toaster } from "../ui/toaster";
import { trackEvent } from "@/lib/analytics";

interface ClimateActionsSectionProps {
  t: (key: string) => string;
  onReprioritize?: ({ ignoreExisting }: { ignoreExisting: boolean }) => void;
  actions: HIAPResponse | undefined;
  inventory: InventoryResponse | null;
  actionType?: ACTION_TYPES;
  lng?: LANGUAGES;
  setIgnoreExisting?: (ignoreExisting: boolean) => void;
  isReprioritizing?: boolean;
}

export function ClimateActionsSection({
  t,
  onReprioritize,
  actions,
  inventory,
  actionType = ACTION_TYPES.Mitigation,
  lng = LANGUAGES.en,
  setIgnoreExisting,
  isReprioritizing,
}: ClimateActionsSectionProps) {
  const [actionsByLng, setActionsByLng] = useState<HIAction[] | undefined>(
    actions?.rankedActions,
  );

  // ensure that ranked actions rerenders when route recompiles
  useEffect(() => {
    setActionsByLng(actions?.rankedActions);
  }, [actions?.rankedActions]);

  const handleReprioritize = async () => {
    if (!inventory?.inventoryId) {
      logger.warn("Cannot reprioritize without inventory ID");
      return;
    }

    try {
      // Track HIAP reprioritization
      trackEvent("hiap_plan_generated", {
        action_type: actionType,
        inventory_id: inventory.inventoryId,
        is_retry: false,
        is_reprioritization: true,
        existing_actions_count: actions?.rankedActions?.length || 0,
      });

      logger.info(
        {
          inventoryId: inventory.inventoryId,
          actionType,
          lng,
          ignoreExisting: true,
        },
        "Starting reprioritization",
      );

      // Show toast notification that reprioritization has started
      toaster.create({
        title: t("reprioritization-started"),
        description: t("reprioritization-started-description"),
        type: "info",
        duration: 5000,
      });

      onReprioritize?.({ ignoreExisting: true });
      setIgnoreExisting?.(true);
    } catch (error) {
      logger.error({ error }, "Failed to reprioritize actions");

      // Show error toast
      toaster.create({
        title: t("reprioritization-failed"),
        description: t("reprioritization-failed-description"),
        type: "error",
        duration: 5000,
      });
    }
  };
  return (
    <>
      {actionsByLng && actionsByLng.length > 0 ? (
        <Box display="flex" flexDirection="column" gap="24px" pb="24px">
          <Box display="flex" flexDirection="column" gap="16px">
            <ButtonMedium
              color="content.link"
              fontFamily="heading"
              fontWeight="bold"
              textTransform="uppercase"
            >
              {t("citycatalyst-actions-title")}
            </ButtonMedium>
          </Box>
          <Box
            display="flex"
            flexDirection="row"
            gap="24px"
            alignItems="center"
          >
            <Box display="flex" flexDirection="column" gap="8px">
              <HeadlineSmall
                fontFamily="heading"
                fontWeight="bold"
                color="content.secondary"
              >
                {t("top-actions-for-your-city")}
              </HeadlineSmall>
              <BodyLarge fontFamily="body" color="content.tertiary">
                {t("top-actions-for-your-city-description")}
              </BodyLarge>
            </Box>
            <Box>
              <Button
                bg="content.link"
                color="white"
                px="24px"
                h="84px"
                borderRadius="16px"
                gap="12px"
                onClick={handleReprioritize}
                loading={isReprioritizing}
                disabled={isReprioritizing}
              >
                <Icon
                  as={LuRefreshCw}
                  rotate={"270deg"}
                  boxSize={"36px"}
                  color="white"
                />
                <HeadlineSmall
                  fontFamily="heading"
                  fontWeight="bold"
                  textTransform="none"
                  color="white"
                >
                  {isReprioritizing
                    ? t("re-prioritizing")
                    : t("re-prioritize-actions")}
                </HeadlineSmall>
              </Button>
            </Box>
          </Box>
        </Box>
      ) : (
        <Box display="flex" flexDirection="column" gap="24px" pb="24px">
          <Box display="flex" flexDirection="column" gap="16px">
            <TitleSmall
              color="content.link"
              fontFamily="heading"
              fontSize="title.sm"
              fontWeight="bold"
              textTransform="uppercase"
            >
              {t("climate-actions-title")}
            </TitleSmall>
          </Box>
          <Box
            display="flex"
            flexDirection="column"
            gap="24px"
            alignItems="center"
          >
            <Box display="flex" flexDirection="column" gap="8px">
              <HeadlineSmall
                fontFamily="heading"
                fontWeight="bold"
                color="content.secondary"
              >
                {t("top-actions-for-your-city")}
              </HeadlineSmall>
              <BodyLarge fontFamily="body" color="content.tertiary">
                {t("actions-for-your-city-description")}
              </BodyLarge>
            </Box>
            {/* if inventory is not null, show the tip */}
            {inventory && (
              <Box
                w="full"
                display="flex"
                flexDirection="row"
                gap="8px"
                alignItems="center"
                border="1px solid"
                borderColor="border.neutral"
                borderRadius="8px"
                p="16px"
              >
                <Icon as={MdOutlineInfo} boxSize="16px" color="content.link" />
                <BodyLarge fontFamily="body" color="content.secondary">
                  {t("top-actions-tip")}
                </BodyLarge>
              </Box>
            )}
          </Box>
        </Box>
      )}
    </>
  );
}
