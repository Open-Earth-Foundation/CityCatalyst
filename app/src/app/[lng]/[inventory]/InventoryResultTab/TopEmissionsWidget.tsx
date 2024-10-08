import {
  Box,
  Card,
  Center,
  CircularProgress,
  Heading,
  HStack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import type {
  InventoryResponse,
  SectorEmission,
  TopEmission,
} from "@/util/types";
import { capitalizeFirstLetter, convertKgToTonnes } from "@/util/helpers";
import { api } from "@/services/api";
import {
  SegmentedProgress,
  SegmentedProgressValues,
} from "@/components/SegmentedProgress";

const EmissionsTable = ({
  topEmissions,
  t,
}: {
  topEmissions: TopEmission[];
  t: TFunction;
}) => {
  return (
    <TableContainer my={4}>
      <Table variant="simple">
        <Thead>
          <Tr>
            <Th sx={{ font: "bold", color: "black" }}>{t("subsector")}</Th>
            <Th sx={{ font: "bold", color: "black" }}>
              {t("total-emissions-CO2eq")}
            </Th>
            <Th sx={{ font: "bold", color: "black" }}>{t("%-of-emissions")}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {(topEmissions || []).map((emission, index) => (
            <Tr key={index}>
              <Td>
                <Text
                  fontFamily="heading"
                  className="text-sm leading-5 tracking-[0.5px]"
                >
                  {emission.subsectorName}
                </Text>
                <Text
                  fontFamily="heading"
                  color="content.tertiary"
                  className="text-xs leading-4 tracking-[0.5px] "
                >
                  {capitalizeFirstLetter(t("scope"))} {emission.scopeName} -{" "}
                  {emission.sectorName}{" "}
                </Text>
              </Td>
              <Td>{convertKgToTonnes(emission.co2eq)}</Td>
              <Td>{emission.percentage}%</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
};

const TopEmissionsWidget = ({
  t,
  inventory,
}: {
  t: Function & TFunction<"translation", undefined>;
  inventory?: InventoryResponse;
}) => {
  const { data: results, isLoading: isTopEmissionsResponseLoading } =
    api.useGetResultsQuery(inventory!.inventoryId!);

  function getPercentagesForProgress(): SegmentedProgressValues[] {
    const bySector: SectorEmission[] = results?.totalEmissions.bySector ?? [];
    return bySector.map(({ sectorName, co2eq, percentage }) => {
      return {
        name: sectorName,
        value: co2eq,
        percentage: percentage,
      } as SegmentedProgressValues;
    });
  }

  return (
    <HStack>
      <Card marginLeft={"4"} backgroundColor={"white"} p={4}>
        {isTopEmissionsResponseLoading ? (
          <Center>
            <CircularProgress />
          </Center>
        ) : (
          <>
            <Box>
              <Heading size="sm" my={4}>
                {t("total-emissions")}
              </Heading>
            </Box>
            <SegmentedProgress
              values={getPercentagesForProgress()}
              total={results?.totalEmissions.total}
              t={t}
              showLabels
              showHover
            />
            <Box>
              <Heading size="sm" marginTop={10} marginBottom={4}>
                {t("top-emissions")}
              </Heading>
            </Box>
            <EmissionsTable
              topEmissions={results!.topEmissions.bySubSector}
              t={t}
            />
          </>
        )}
      </Card>
    </HStack>
  );
};

export default TopEmissionsWidget;
