import { LabelLarge } from "@/components/package/Texts/Label";
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import { EmissionsForecastData } from "@/util/types";
import { Box, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { MdBarChart } from "react-icons/md";
import { GrowthRatesExplanationModalTable } from "./GrowthRatesExplanationModalTable";
import { BodyLarge, DisplayLarge } from "@/components/package";

export function GrowthRatesExplanationModal({
  t,
  isOpen,
  onClose,
  emissionsForecast,
  lng,
}: {
  t: TFunction;
  isOpen: boolean;
  onClose: () => void;
  emissionsForecast: EmissionsForecastData;
  lng: string;
}) {
  const { cluster, growthRates } = emissionsForecast;
  return (
    <DialogRoot
      open={isOpen}
      onOpenChange={onClose}
      placement="center"
      size="xl"
      scrollBehavior="inside"
    >
      <DialogContent maxHeight="calc(100vh - 56px * 2)">
        <DialogHeader>
          <HStack>
            <Icon as={MdBarChart} boxSize="24px" color="interactive.control" />
            <Text
              color="content.primary"
              fontWeight="bold"
              lineHeight="headline.sm"
              fontSize="24px"
              fontFamily="heading"
              fontStyle="normal"
            >
              {t("about-growth-rates")}
            </Text>
          </HStack>
        </DialogHeader>
        <Box divideX="1px" borderColor="border.overlay" borderWidth="1px" />
        <DialogBody>
          <VStack alignItems="left" justifyItems="end" p="24px">
            <Text
              color="content.primary"
              fontWeight="bold"
              lineHeight="headline.sm"
              fontSize="24px"
              fontFamily="heading"
              fontStyle="normal"
            >
              {t("city-typology-and-clusters")}
            </Text>
            <Text
              my="12px"
              color="content.tertiary"
              lineHeight="24px"
              fontSize="16px"
              fontStyle="normal"
              fontWeight="regular"
            >
              {t("city-typology-and-clusters-description")}
            </Text>
          </VStack>
          <HStack alignItems="flex-end" color="content.tertiary">
            <VStack alignItems="center" justifyItems="end" p="24px">
              <DisplayLarge color="content.tertiary">
                {cluster?.id}
              </DisplayLarge>
              <LabelLarge textWrap="nowrap">{t("cluster-#")}</LabelLarge>
            </VStack>
            <VStack alignItems="left" justifyItems="end" p="24px">
              <BodyLarge fontWeight="regular">
                {cluster?.description?.[lng]}
              </BodyLarge>
              <LabelLarge>{t("description")}</LabelLarge>
            </VStack>
          </HStack>
          <VStack alignItems="left" justifyItems="end" p="24px">
            <Text
              color="content.primary"
              fontWeight="bold"
              lineHeight="headline.sm"
              fontSize="24px"
              fontFamily="heading"
              fontStyle="normal"
            >
              {t("methodology-and-assumptions")}
            </Text>
            <Text
              my="12px"
              color="content.tertiary"
              lineHeight="24px"
              fontSize="16px"
              fontStyle="normal"
              fontWeight="regular"
            >
              {t("methodology-and-assumptions-description")}
            </Text>
          </VStack>
          <Box display="flex" justifySelf="center" width="100%" px="24px">
            <GrowthRatesExplanationModalTable growthRates={growthRates} t={t} />
          </Box>
        </DialogBody>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  );
}
