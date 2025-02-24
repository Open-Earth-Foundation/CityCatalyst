import React from "react";
import { Box, Button, Table } from "@chakra-ui/react";
import { ActivityDataByScope } from "@/util/types";
import type { TFunction } from "i18next";
import { convertKgToTonnes, toKebabCase } from "@/util/helpers";
import { InventoryTypeEnum, SECTORS } from "@/util/constants";
import { ButtonSmall } from "@/components/Texts/Button";

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
    <Box py={4}>
      <Table.Root variant="line">
        <Table.Header className="uppercase">
          <Table.ColumnHeader>
            <ButtonSmall>{tData("subsector")}</ButtonSmall>
          </Table.ColumnHeader>
          <Table.ColumnHeader>
            <ButtonSmall>{tDashboard("total-emissions")}</ButtonSmall>
          </Table.ColumnHeader>
          <Table.ColumnHeader>
            <ButtonSmall>{tDashboard("%-of-sector-emissions")}</ButtonSmall>
          </Table.ColumnHeader>
          {scopes.map((s) => (
            <Table.ColumnHeader key={s}>
              <ButtonSmall>
                {tDashboard("emissions-scope")} {s}
              </ButtonSmall>
            </Table.ColumnHeader>
          ))}
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
