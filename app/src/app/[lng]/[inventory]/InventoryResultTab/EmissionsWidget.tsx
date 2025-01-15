import { convertKgToTonnes } from "@/util/helpers";
import {
  Box,
  Card,
  CardBody,
  CardHeader,
  Heading,
  HStack,
  Icon,
  Stack,
  StackSeparator,
  Text,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { InventoryResponse } from "@/util/types";
import { Trans } from "react-i18next/TransWithoutContext";
import { MdArrowOutward } from "react-icons/md";
import { PopulationAttributes } from "@/models/Population";
import { HeatIcon } from "@/components/icons";

import {
  ProgressCircleRing,
  ProgressCircleRoot,
} from "@/components/ui/progress-circle";

const EmissionsWidgetCard = ({
  icon,
  value,
  field,
  showProgress,
}: {
  icon: any;
  value?: number | undefined;
  field: any;
  showProgress: boolean;
}) => {
  const finalValue = value
    ? showProgress
      ? `${value.toFixed(1)}%`
      : convertKgToTonnes(value)
    : "N/A";

  return (
    <HStack align="center" marginY={"9px"} justify="space-between" key={field}>
      <Stack w="full" height={"83px"}>
        <HStack align="start">
          {value && showProgress ? (
            <ProgressCircleRoot
              value={Math.round(value)}
              size="sm"
              color="interactive.secondary"
              mr="4px"
            >
              <ProgressCircleRing cap="round" css={{ "--thickness": "2px" }} />
            </ProgressCircleRoot>
          ) : (
            <Icon color={"red"} as={icon} boxSize={8} />
          )}
          <Heading size="lg" lineClamp={3} maxWidth="200px">
            {finalValue}
          </Heading>
        </HStack>
        <Text fontSize={"xs"} color="content.tertiary">
          {field}
        </Text>
      </Stack>
    </HStack>
  );
};

const EmissionsWidget = ({
  t,
  inventory,
  population,
}: {
  t: Function & TFunction<"translation", undefined>;
  inventory?: InventoryResponse;
  population?: PopulationAttributes;
}) => {
  // Country total is in tonnes, inventory total is in kg
  const percentageOfCountrysEmissions =
    inventory?.totalEmissions && inventory?.totalCountryEmissions
      ? (inventory.totalEmissions / (inventory.totalCountryEmissions * 1000)) *
        100
      : undefined;
  const emissionsPerCapita =
    inventory?.totalEmissions && population?.population
      ? inventory.totalEmissions / population.population
      : undefined;
  const EmissionsData = [
    {
      id: "total-ghg-emissions-in-year",
      field: (
        <Trans
          size={16}
          i18nKey="total-ghg-emissions-in-year"
          values={{ year: inventory?.year }}
          t={t}
        >
          Total GHG Emissions in {{ year: inventory?.year }}
        </Trans>
      ),
      value: inventory?.totalEmissions,
      icon: HeatIcon,
      showProgress: false,
    },
    {
      id: "emissions-per-capita-in-year",
      field: (
        <Trans
          size={16}
          i18nKey="emissions-per-capita-in-year"
          values={{ year: inventory?.year }}
          t={t}
        ></Trans>
      ),
      value: emissionsPerCapita,
      icon: HeatIcon,
      showProgress: false,
    },
    {
      id: "% of country's emissions",
      field: t("%-of-country's-emissions"),
      showProgress: true,
      value: percentageOfCountrysEmissions,
    },
  ];
  return (
    <Box>
      <Card.Root padding={0} height="448px" width={"353px"}>
        <CardHeader>
          <Heading size="sm">{t("total-emissions")}</Heading>
        </CardHeader>

        <CardBody>
          <Stack separator={<StackSeparator />}>
            {EmissionsData.map(({ id, field, value, icon, showProgress }) => (
              <EmissionsWidgetCard
                key={id}
                icon={icon}
                value={value}
                field={field}
                showProgress={showProgress}
              />
            ))}
          </Stack>
        </CardBody>
      </Card.Root>
    </Box>
  );
};

export default EmissionsWidget;
