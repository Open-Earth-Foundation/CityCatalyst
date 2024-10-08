import React from "react";
import {
  Box,
  ChakraProvider,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@chakra-ui/react";
import { ActivityDataByScope } from "@/util/types";
import type { TFunction } from "i18next";
import { convertKgToTonnes } from "@/util/helpers";

interface ByScopeViewProps {
  data: ActivityDataByScope[];
  tData: TFunction;
  tDashboard: TFunction;
  sectorName: string;
}

const ByScopeView: React.FC<ByScopeViewProps> = ({
  data,
  tData,
  tDashboard,
  sectorName,
}) => {
  const scopes = sectorName === "waste" ? ["1", "3"] : ["1", "2"];
  return (
    <ChakraProvider>
      <Box p={4}>
        <Table variant="simple">
          <Thead>
            <Tr>
              <Th>{tData("subsector")}</Th>
              <Th>{tDashboard("total-emissions")}</Th>
              <Th>{tDashboard("%-of-sector-emissions")}</Th>
              {scopes.map((s) => (
                <Th key={s}>
                  {tDashboard("emissions-scope")} {s}
                </Th>
              ))}
            </Tr>
          </Thead>
          <Tbody>
            {data.map((item, index) => (
              <Tr key={index}>
                <Td>{tData(item.activityTitle)}</Td>
                <Td>{convertKgToTonnes(item.totalEmissions)}</Td>
                <Td>{item.percentage}%</Td>
                {scopes.map((s) => (
                  <Td key={s}>{convertKgToTonnes(item.scopes[s] || 0)}</Td>
                ))}
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>
    </ChakraProvider>
  );
};

export default ByScopeView;
