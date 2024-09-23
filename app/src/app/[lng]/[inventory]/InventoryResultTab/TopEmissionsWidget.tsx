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
  Tr
} from "@chakra-ui/react";
import {TFunction} from "i18next";
import {InventoryResponse, TopEmission} from "@/util/types";
import {capitalizeFirstLetter, convertKgToTonnes} from "@/util/helpers";
import {api} from "@/services/api";
import groupBy from "lodash/groupBy";
import {SegmentedProgress, SegmentedProgressValues} from "@/components/SegmentedProgress";

const EmissionsTable = ({ topEmissions, t }: { topEmissions: TopEmission[], t: TFunction }) => {
  return (
    <TableContainer my={4}>
      <Table variant="simple">
        <Thead>
          <Tr>
            <Th sx={{ "font": "bold", color: "black" }}>{t("subsector")}</Th>
            <Th sx={{ "font": "bold", color: "black" }}>{t("total-emissions-CO2eq")}</Th>
            <Th sx={{ "font": "bold", color: "black" }}>{t("%-of-emissions")}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {(topEmissions || []).map((emission, index) => (
            <Tr key={index}>
              <Td>
                <Text
                  fontFamily="heading"
                  className="text-sm leading-5 tracking-[0.5px]"
                >{emission.subsectorName}</Text>
                <Text
                  fontFamily="heading"
                  color="content.tertiary"
                  className="text-xs leading-4 tracking-[0.5px] "
                  >{capitalizeFirstLetter(t("scope"))} {emission.scopeName} - {emission.sectorName} </Text>
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
                              inventory
                            }: {
  t: Function & TFunction<"translation", undefined>;
  inventory?: InventoryResponse;
}) => {

  const { data: results, isLoading: isTopEmissionsResponseLoading } =
    api.useGetResultsQuery(inventory!.inventoryId!);

  function getPercentagesForProgress(): SegmentedProgressValues[] {
    // @ts-ignore
    const grouped = (groupBy(results?.totalEmissions.bySector, e => e.sectorName)) as Record<string, [{
      co2eq: bigint,
      percentage: number
    }]>;
    const out = Object.entries(grouped || {}).map(([name, [{ co2eq, percentage }]]) => {
      return {
        name,
        value: co2eq,
        percentage: percentage
      } as SegmentedProgressValues;
    });
    return out;

  }

  return (
    <HStack>
      <Card  marginLeft={"4"} backgroundColor={"white"} p={4}>
        {isTopEmissionsResponseLoading
          ? <Center><CircularProgress isIndeterminate /></Center>
          : <>
            <Box>
              <Heading size="sm" my={4}>{t("total-emissions")}</Heading>
            </Box>
            <SegmentedProgress values={getPercentagesForProgress()} total={results!.totalEmissions.total} t={t}
                               showLabels showHover />
              <Box>
                <Heading size="sm" marginTop={10} marginBottom={4}>{t("top-emissions")}</Heading>
              </Box>
            <EmissionsTable topEmissions={results!.topEmissions.bySubSector} t={t} />
          </>
        }
      </Card>
    </HStack>
  );
};

export default TopEmissionsWidget;