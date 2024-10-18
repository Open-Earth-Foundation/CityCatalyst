import React from "react";
import {
  Box,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { ActivityBreakdown } from "@/util/types";
import { convertKgToTonnes } from "@/util/helpers";

interface ByActivityViewTableProps {
  data: ActivityBreakdown;
  tData: TFunction;
  tDashboard: TFunction;
  sectorName: string;
}

const ByActivityViewTable: React.FC<ByActivityViewTableProps> = ({
  data,
  tData,
  tDashboard,
  sectorName,
}) => {
  const renderRows = (data: ActivityBreakdown) => {
    const rows: JSX.Element[] = [];
    Object.entries(data).forEach(([subSector, subSectorData]) => {
      if (subSector === "totals") {
        return;
      }

      Object.entries(subSectorData).forEach(([activity, details]) => {
        const {
          activityValue,
          activityUnits,
          totalActivityEmissions,
          totalEmissionsPercentage,
        } = details;
        rows.push(
          <Tr key={`${subSector}-${activity}-${activityUnits}`}>
            <Td>{tData(subSector)}</Td>
            <Td>
              {activityValue === "N/A"
                ? "N/A"
                : `${activityValue} ${tData(activityUnits)}`}
            </Td>
            <Td>{convertKgToTonnes(totalActivityEmissions)}</Td>
            <Td>{totalEmissionsPercentage}%</Td>
          </Tr>,
        );
      });
    });

    return rows;
  };
  const consumptionOrMassTitle =
    sectorName !== "waste" ? "consumption" : "mass-of-waste";
  return (
    <Box p={4}>
      <TableContainer>
        <Table variant="simple">
          <Thead>
            <Tr>
              <Th>{tDashboard("activity-type")}</Th>
              <Th>{tDashboard(consumptionOrMassTitle)}</Th>
              <Th>{tDashboard("emissions")}</Th>
              <Th>{tDashboard("%-of-sub-sector-emissions")}</Th>
            </Tr>
          </Thead>
          <Tbody>{renderRows(data)}</Tbody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default ByActivityViewTable;
