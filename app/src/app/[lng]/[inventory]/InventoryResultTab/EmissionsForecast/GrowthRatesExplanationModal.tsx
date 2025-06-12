import { DisplayLarge } from "@/components/Texts/Display";
import { LabelLarge } from "@/components/Texts/Label";
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import { EmissionsForecastData } from "@/util/types";
import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { MdBarChart } from "react-icons/md";
import { GrowthRatesExplanationModalTable } from "./GrowthRatesExplanationModalTable";

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
      size={"xl"}
    >
      <DialogContent>
        <DialogHeader>
          <HStack>
            <MdBarChart size={"24px"} fontSize={"24px"} />
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
          <VStack alignItems={"left"} justifyItems={"end"} p="24px">
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
              my={"12px"}
              color="content.primary"
              lineHeight="24px"
              fontSize="16px"
              fontStyle="normal"
              fontWeight="regular"
            >
              {t("city-typology-and-clusters-description")}
            </Text>
          </VStack>
          <HStack
            my={"12px"}
            mx={"24px"}
            marginTop={"48px"}
            alignItems={"flex-end"}
          >
            <VStack alignItems={"left"} justifyItems={"end"} p="24px">
              <DisplayLarge color="black">{cluster?.id}</DisplayLarge>
              <LabelLarge>{t("cluster-#")}</LabelLarge>
            </VStack>
            <VStack alignItems={"left"} justifyItems={"end"} p="24px">
              <DisplayLarge
                fontSize="body.xl"
                color="content.primary"
                lineHeight="32px"
                fontWeight="regular"
              >
                {cluster?.description?.[lng]}
              </DisplayLarge>
              <LabelLarge>{t("description")}</LabelLarge>
            </VStack>
          </HStack>
          <VStack alignItems={"left"} justifyItems={"end"} p="24px">
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
              my={"12px"}
              color="content.primary"
              lineHeight="24px"
              fontSize="16px"
              fontStyle="normal"
              fontWeight="regular"
            >
              {t("methodology-and-assumptions-description")}
            </Text>
          </VStack>
          <Box>
            <Box display="flex" justifySelf={"center"} width="100%" px="24px">
              <GrowthRatesExplanationModalTable
                growthRates={growthRates}
                t={t}
              />
            </Box>
          </Box>
        </DialogBody>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  );
}
