import React from "react";
import { Box, Table } from "@chakra-ui/react";
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
          <Table.Row key={`${subSector}-${activity}-${activityUnits}`}>
            <Table.Cell>{tData(subSector)}</Table.Cell>
            <Table.Cell>
              {activityValue === "N/A"
                ? "N/A"
                : `${activityValue} ${tData(activityUnits)}`}
            </Table.Cell>
            <Table.Cell>{convertKgToTonnes(totalActivityEmissions)}</Table.Cell>
            <Table.Cell>{totalEmissionsPercentage}%</Table.Cell>
          </Table.Row>,
        );
      });
    });

    return rows;
  };
  const consumptionOrMassTitle =
    sectorName !== "waste" ? "consumption" : "mass-of-waste";
  return (
    <Box p={4}>
      <Table.Root unstyled>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>
              {tDashboard("activity-type")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {tDashboard(consumptionOrMassTitle)}
            </Table.ColumnHeader>
            <Table.ColumnHeader>{tDashboard("emissions")}</Table.ColumnHeader>
            <Table.ColumnHeader>
              {tDashboard("%-of-sub-sector-emissions")}
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>{renderRows(data)}</Table.Body>
      </Table.Root>
    </Box>
  );
};

export default ByActivityViewTable;
