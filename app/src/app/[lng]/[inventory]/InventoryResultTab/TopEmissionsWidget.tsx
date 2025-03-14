import {
  Box,
  Card,
  Center,
  Heading,
  HStack,
  Table,
  Text,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import type {
  InventoryResponse,
  SectorEmission,
  TopEmission,
} from "@/util/types";
import {
  capitalizeFirstLetter,
  convertKgToTonnes,
  toKebabCase,
} from "@/util/helpers";
import { api } from "@/services/api";
import {
  SegmentedProgress,
  SegmentedProgressValues,
} from "@/components/SegmentedProgress";
import { EmptyStateCardContent } from "@/app/[lng]/[inventory]/InventoryResultTab/EmptyStateCardContent";
import { allSectorColors, SECTORS } from "@/util/constants";

import {
  ProgressCircleRing,
  ProgressCircleRoot,
} from "@/components/ui/progress-circle";
import { ButtonSmall } from "@/components/Texts/Button";

const EmissionsTable = ({
  topEmissions,
  t,
}: {
  topEmissions: TopEmission[];
  t: TFunction;
}) => {
  return (
    <Table.Root my={4} variant="outline">
      <Table.Header
        className="uppercase"
        backgroundColor="background.backgroundLight"
      >
        <Table.ColumnHeader>
          <ButtonSmall>{t("subsector")}</ButtonSmall>
        </Table.ColumnHeader>
        <Table.ColumnHeader>
          <ButtonSmall>{t("total-emissions-CO2eq")}</ButtonSmall>
        </Table.ColumnHeader>
        <Table.ColumnHeader>
          <ButtonSmall>{t("%-of-emissions")}</ButtonSmall>
        </Table.ColumnHeader>
      </Table.Header>
      <Table.Body>
        {(topEmissions || []).map((emission, index) => (
          <Table.Row key={index}>
            <Table.Cell css={{ maxWidth: "50%", wordBreak: "break-word" }}>
              <Text
                fontFamily="heading"
                className="text-sm leading-5 tracking-[0.5px]"
                css={{ whiteSpace: "normal" }}
              >
                {t(toKebabCase(emission.subsectorName))}
              </Text>
              <Text
                fontFamily="heading"
                color="content.tertiary"
                className="text-xs leading-4 tracking-[0.5px] "
              >
                {`${capitalizeFirstLetter(t("scope"))} ${t(toKebabCase(emission.scopeName))} - ${t(toKebabCase(emission.sectorName))}`}
              </Text>
            </Table.Cell>
            <Table.Cell>{convertKgToTonnes(emission.co2eq)}</Table.Cell>
            <Table.Cell>{emission.percentage}%</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
};

const TopEmissionsWidget = ({
  t,
  inventory,
  isPublic,
}: {
  t: Function & TFunction<"translation", undefined>;
  inventory?: InventoryResponse;
  isPublic: boolean;
}) => {
  const { data: results, isLoading: isTopEmissionsResponseLoading } =
    api.useGetResultsQuery(inventory!.inventoryId!);

  function getPercentagesForProgress(): SegmentedProgressValues[] {
    const bySector: SectorEmission[] = results?.totalEmissions.bySector ?? [];
    return SECTORS.map(({ name }) => {
      const sector = bySector.find((sector) => sector.sectorName === name)!;
      return {
        name,
        value: sector?.co2eq || 0,
        percentage: sector?.percentage || 0,
      } as SegmentedProgressValues;
    });
  }

  if (isTopEmissionsResponseLoading) {
    return (
      <Card.Root
        marginLeft={"4"}
        backgroundColor={"white"}
        p={4}
        w="full"
        h={450}
      >
        <Card.Body>
          <Center w="full" h="full">
            <ProgressCircleRoot value={null} size="md">
              <ProgressCircleRing cap="round" />
            </ProgressCircleRoot>
          </Center>
        </Card.Body>
      </Card.Root>
    );
  } else if (results!?.totalEmissions.total <= 0) {
    return (
      <Card.Root width={"713px"} height={"448px"}>
        <Card.Header>
          <Heading size="sm">{t("top-emissions")}</Heading>
        </Card.Header>
        <Card.Body>
          <EmptyStateCardContent
            width={"665px"}
            height={"344px"}
            t={t}
            inventoryId={inventory?.inventoryId}
            isPublic={isPublic}
          />
        </Card.Body>
      </Card.Root>
    );
  } else {
    return (
      <Card.Root marginLeft={1} backgroundColor="white">
        <Card.Header>
          <Heading size="sm" my={4}>
            {t("total-emissions")}
          </Heading>
        </Card.Header>
        <Card.Body>
          <SegmentedProgress
            values={getPercentagesForProgress()}
            total={results?.totalEmissions.total}
            t={t}
            colors={allSectorColors}
            showLabels
            showHover
          />
          <Box>
            <Heading size="sm" marginTop={10} marginBottom={4}>
              {t("top-emissions")}
            </Heading>
          </Box>
          <EmissionsTable
            topEmissions={results?.topEmissions?.bySubSector?.slice(0, 3) ?? []}
            t={t}
          />
        </Card.Body>
      </Card.Root>
    );
  }
};

export default TopEmissionsWidget;
