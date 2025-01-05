import { TFunction } from "i18next/typescript/t";
import {
  Divider,
  Heading,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  Text,
  Box,
  VStack,
} from "@chakra-ui/react";
import { MdBarChart } from "react-icons/md";
import { GrowthRatesExplanationModalTable } from "./GrowthRatesExplanationModalTable";
import { EmissionsForecastData } from "@/util/types";

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
    <Modal isOpen={isOpen} onClose={onClose} isCentered size={"4xl"}>
      <ModalContent>
        <ModalHeader>
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
            <ModalCloseButton />
          </HStack>
        </ModalHeader>
        <Divider borderColor="border.overlay" borderWidth="1px" />
        <ModalBody>
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
          <HStack
            my={"12px"}
            mx={"24px"}
            marginTop={"48px"}
            alignItems={"flex-end"}
          >
            <VStack alignItems={"center"}>
              <Heading
                fontSize="display.lg"
                textAlign="center"
                color="content.primary"
              >
                {cluster?.id}
              </Heading>
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
            <VStack alignItems={"left"} justifyItems={"end"}>
              <Heading
                fontSize="body.xl"
                color="content.primary"
                lineHeight="32px"
                fontWeight="regular"
              >
                {cluster?.description?.[lng]}
              </Heading>
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
          <ModalBody>
            <Box display="flex" justifySelf={"center"}>
              <GrowthRatesExplanationModalTable
                growthRates={growthRates}
                t={t}
              />
            </Box>
          </ModalBody>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
