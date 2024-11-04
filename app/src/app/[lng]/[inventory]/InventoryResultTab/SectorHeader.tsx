import { IconBaseProps } from "react-icons";
import type { TFunction } from "i18next";
import { SectorEmission } from "@/util/types";
import { HStack, Icon, Text, VStack } from "@chakra-ui/react";
import { capitalizeFirstLetter, convertKgToTonnes } from "@/util/helpers";

export const SectorHeader = ({
  icon,
  t,
  sectorName,
  dataForSector,
}: {
  icon: React.ElementType<IconBaseProps>;
  t: TFunction;
  sectorName: string;
  dataForSector?: SectorEmission;
}) => (
  <HStack alignItems={"start"}>
    <Icon as={icon} height="24px" w="24px" color="brand.secondary" />
    <VStack alignItems={"start"} gap={0}>
      <Text fontSize="14px" fontWeight="500" fontStyle="normal">
        {capitalizeFirstLetter(t("sector"))} -{" "}
        {capitalizeFirstLetter(t(sectorName))}
      </Text>
      <Text fontWeight={"600"} fontSize={"28px"} color={"content.secondary"}>
        {dataForSector?.co2eq
          ? convertKgToTonnes(dataForSector!.co2eq)
          : t("N/A")}
      </Text>
      <Text
        fontWeight={"400"}
        fontSize={"16px"}
        color={"content.secondary"}
        opacity={"60%"}
      >
        {(dataForSector?.percentage || t("N/A") + " ") +
          "% " +
          t("of-total-emissions")}
      </Text>
    </VStack>
  </HStack>
);
