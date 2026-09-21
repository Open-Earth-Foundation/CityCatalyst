import { IconBaseProps } from "react-icons";
import type { TFunction } from "i18next";
import { SectorEmission } from "@/util/types";
import { HStack, Icon, Text, VStack } from "@chakra-ui/react";
import { capitalizeFirstLetter, formatEmissionsOrRemoval } from "@/util/helpers";

export const SectorHeader = ({
  icon,
  t,
  sectorName,
  dataForSector,
  numberFormat,
}: {
  icon: React.ElementType<IconBaseProps>;
  t: TFunction;
  sectorName: string;
  dataForSector?: SectorEmission;
  numberFormat?: string;
}) => {
  // A sector whose removals outweigh its emissions nets negative - percentage-of-total
  // isn't meaningful for it, so show it as a removal instead. See CC-749.
  const isNetRemoval = (dataForSector?.co2eq ?? 0n) < 0n;

  return (
    <HStack alignItems={"start"}>
      <Icon as={icon} height="24px" w="24px" color="interactive.secondary" />
      <VStack alignItems={"start"} gap={0}>
        <Text fontSize="14px" fontWeight="500" fontStyle="normal">
          {capitalizeFirstLetter(t("sector"))} -{" "}
          {capitalizeFirstLetter(t(sectorName))}
        </Text>
        <Text fontWeight={"600"} fontSize={"28px"} color={"content.secondary"}>
          {dataForSector?.co2eq
            ? formatEmissionsOrRemoval(
                dataForSector.co2eq,
                numberFormat,
                t("removed"),
              )
            : t("N/A")}
        </Text>
        <Text
          fontWeight={"400"}
          fontSize={"16px"}
          color={"content.secondary"}
          opacity={"60%"}
        >
          {isNetRemoval
            ? t("net-removal")
            : (dataForSector?.percentage || t("N/A") + " ") +
              "% " +
              t("of-total-emissions")}
        </Text>
      </VStack>
    </HStack>
  );
};
