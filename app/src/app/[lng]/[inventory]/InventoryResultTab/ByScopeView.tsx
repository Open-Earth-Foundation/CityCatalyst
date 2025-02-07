import React from "react";
import { Box, Table } from "@chakra-ui/react";
import { ActivityDataByScope } from "@/util/types";
import type { TFunction } from "i18next";
import { convertKgToTonnes, toKebabCase } from "@/util/helpers";
import { InventoryTypeEnum, SECTORS } from "@/util/constants";

interface ByScopeViewProps {
  data: ActivityDataByScope[];
  tData: TFunction;
  tDashboard: TFunction;
  sectorName: string;
  inventoryType: InventoryTypeEnum;
}

const ByScopeView: React.FC<ByScopeViewProps> = ({
  data,
  tData,
  tDashboard,
  sectorName,
  inventoryType,
}) => {
  const scopes = SECTORS.find((s) => sectorName === s.name)!.inventoryTypes[
    inventoryType
  ].scopes;
  return (
    <Box p={4}>
      <Table.Root unstyled variant="line">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>{tData("subsector")}</Table.ColumnHeader>
            <Table.ColumnHeader>
              {tDashboard("total-emissions")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {tDashboard("%-of-sector-emissions")}
            </Table.ColumnHeader>
            {scopes.map((s) => (
              <Table.ColumnHeader key={s}>
                {tDashboard("emissions-scope")} {s}
              </Table.ColumnHeader>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {data.map((item, index) => (
            <Table.Row key={index}>
              <Table.Cell>{tData(toKebabCase(item.activityTitle))}</Table.Cell>
              <Table.Cell>{convertKgToTonnes(item.totalEmissions)}</Table.Cell>
              <Table.Cell>{item.percentage}%</Table.Cell>
              {scopes.map((s) => (
                <Table.Cell key={s}>
                  {convertKgToTonnes(item.scopes[s] || 0)}
                </Table.Cell>
              ))}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
};

export default ByScopeView;
