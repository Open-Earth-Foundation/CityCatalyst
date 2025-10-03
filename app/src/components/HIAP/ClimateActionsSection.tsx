"use client";
import React, { useEffect, useState } from "react";
import { Box, Button, Icon } from "@chakra-ui/react";
import { LuRefreshCw } from "react-icons/lu";
import { MdOutlineInfo } from "react-icons/md";
import { HIAction, HIAPResponse, InventoryResponse } from "@/util/types";
import { ButtonMedium } from "@/components/package/Texts/Button";
import { HeadlineSmall } from "@/components/package/Texts/Headline";
import { BodyLarge } from "@/components/package/Texts/Body";
import { TitleSmall } from "@/components/package/Texts/Title";

interface ClimateActionsSectionProps {
  t: (key: string) => string;
  onReprioritize?: () => void;
  actions: HIAPResponse | undefined;
  inventory?: InventoryResponse | null;
}

export function ClimateActionsSection({
  t,
  onReprioritize,
  actions,
  inventory,
}: ClimateActionsSectionProps) {
  const [actionsByLng, setActionsByLng] = useState<HIAction[] | undefined>(
    actions?.rankedActions,
  );

  // ensure that ranked actions rerenders when route recompiles
  useEffect(() => {
    setActionsByLng(actions?.rankedActions);
  }, [actions?.rankedActions]);

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
                onClick={() => onReprioritize?.()}
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
                  {t("re-prioritize-actions")}
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
