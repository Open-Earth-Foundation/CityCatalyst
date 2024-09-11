import {
  Box,
  Center,
  CircularProgress,
  Heading,
  HStack,
  Select,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { InventoryResponse, TopEmission } from "@/util/types";
import { convertKgToTonnes } from "@/util/helpers";
import { api } from "@/services/api";
import groupBy from "lodash/groupBy";
import { SegmentedProgress, SegmentedProgressValues } from "@/components/SegmentedProgress";

const TitleAndSelector = ({ t }: { t: Function }) => {
  return <HStack justifyContent="space-between">
    <Box>
      <Heading size="sm">{t("top-emissions")}</Heading>
    </Box>
    <Select width={"15vw"} my={2}
    >
      {["by-sub-sector"].map((grouping) => (
        <option key={grouping} value={grouping}>
          {t(grouping)}
        </option>
      ))}
    </Select>
  </HStack>;
};


const EmissionsTable = ({ topEmissions }: { topEmissions: TopEmission[] }) => {
  return (
    <TableContainer my={4}>
      <Table variant="simple">
        <Thead>
          <Tr>
            <Th sx={{ "font": "bold", color: "black" }}>Subsector</Th>
            <Th sx={{ "font": "bold", color: "black" }}>Total Emissions (CO2eq)</Th>
            <Th sx={{ "font": "bold", color: "black" }}>% of Emissions</Th>
          </Tr>
        </Thead>
        <Tbody>
          {(topEmissions || []).map((emission, index) => (
            <Tr key={index}>
              <Td>
                <Text fontSize="xl">{emission.subsectorName}</Text>
                <Text fontSize="sm" color={"gray"}>{emission.sectorName}</Text>
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
      <Box width={"45vw"} marginLeft={"4"}>
        {isTopEmissionsResponseLoading
          ? <Center><CircularProgress isIndeterminate /></Center>
          : <>
            <TitleAndSelector t={t} />
            <SegmentedProgress values={getPercentagesForProgress()} total={results!.totalEmissions.total} t={t}
                               showLabels showHover />
            <EmissionsTable topEmissions={results!.topEmissions.bySubSector} />
          </>
        }
      </Box>
    </HStack>
  );
};

export default TopEmissionsWidget;