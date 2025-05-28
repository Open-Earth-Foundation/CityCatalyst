import { TFunction } from "i18next";
import { Heading, HStack, Text, Box, VStack } from "@chakra-ui/react";
import { MdBarChart } from "react-icons/md";
import { GrowthRatesExplanationModalTable } from "./GrowthRatesExplanationModalTable";
import { EmissionsForecastData } from "@/util/types";
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DisplayLarge } from "@/components/Texts/Display";

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
              <Text
                fontSize="label.lg"
                fontStyle="normal"
                lineHeight="20px"
                letterSpacing="wide"
                color={"content.tertiary"}
                fontFamily="Poppins"
                fontWeight="500"
                whiteSpace="nowrap"
              >
                {t("cluster-#")}
              </Text>
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
              <Text
                fontFamily="Poppins"
                fontSize="label.lg"
                fontStyle="normal"
                lineHeight="20px"
                letterSpacing="wide"
                color={"content.tertiary"}
                fontWeight="500"
                textAlign="left"
              >
                {t("description")}
              </Text>
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
