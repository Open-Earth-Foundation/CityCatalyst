import React, { useState } from "react";
import { Box, Table, useDisclosure, Text, Flex, Icon } from "@chakra-ui/react";
import { ActivityDataByScope } from "@/util/types";
import type { TFunction } from "i18next";
import { convertKgToTonnes, toKebabCase } from "@/util/helpers";
import { InventoryTypeEnum, SECTORS } from "@/util/constants";
import { ButtonSmall } from "@/components/Texts/Button";
import { BodyMedium } from "@/components/Texts/Body";
import ByScopeViewSourceDrawer from "./ByScopeViewSourceDrawer";
import { LuChevronDown } from "react-icons/lu";

interface ByScopeViewProps {
  data: ActivityDataByScope[];
  tData: TFunction;
  tDashboard: TFunction;
  sectorName: string;
  inventoryType: InventoryTypeEnum;
  inventoryId: string;
}

const ByScopeView: React.FC<ByScopeViewProps> = ({
  data,
  tData,
  tDashboard,
  sectorName,
  inventoryType,
  inventoryId,
}) => {
  const scopes = SECTORS.find((s) => sectorName === s.name)!.inventoryTypes[
    inventoryType
  ].scopes;
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [expandedSubsectors, setExpandedSubsectors] = useState<Set<string>>(
    new Set(),
  );

  const {
    open: isSourceDrawerOpen,
    onClose: onSourceDrawerClose,
    onOpen: onSourceDrawerOpen,
  } = useDisclosure();

  // Group data by subsector (using first part of activity title)
  const groupedData: Record<string, ActivityDataByScope[]> = {};
  data.forEach((item) => {
    const subsector = item.activityTitle.split("_")[0] || item.activityTitle;
    if (!groupedData[subsector]) {
      groupedData[subsector] = [];
    }
    groupedData[subsector].push(item);
  });

  // Calculate sector total emissions for correct percentage calculation
  const sectorTotalEmissions = data.reduce(
    (sum, item) => sum + Number(item.totalEmissions),
    0,
  );

  const toggleSubsector = (subsector: string) => {
    const newExpanded = new Set(expandedSubsectors);
    if (newExpanded.has(subsector)) {
      newExpanded.delete(subsector);
    } else {
      newExpanded.add(subsector);
    }
    setExpandedSubsectors(newExpanded);
  };

  const renderActivityRow = (
    item: ActivityDataByScope,
    key: string,
    showActivityTitle?: boolean,
  ) => (
    <Table.Row key={key}>
      <Table.Cell>
        {showActivityTitle && (
          <BodyMedium color="content.secondary">
            {tData(toKebabCase(item.activityTitle))}
          </BodyMedium>
        )}
      </Table.Cell>
      <Table.Cell>
        <BodyMedium color="content.secondary">
          {convertKgToTonnes(item.totalEmissions)}
        </BodyMedium>
      </Table.Cell>
      <Table.Cell>
        <BodyMedium color="content.secondary">{item.percentage}%</BodyMedium>
      </Table.Cell>
      {scopes.map((s) => (
        <Table.Cell key={s}>
          <BodyMedium color="content.secondary">
            {convertKgToTonnes(item.scopes[s] || 0)}
          </BodyMedium>
        </Table.Cell>
      ))}
      <Table.Cell>
        <BodyMedium
          color="content.link"
          textDecoration={"underline"}
          textTransform={"uppercase"}
          fontWeight={"bold"}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedSourceId(item.datasource_id || "");
            onSourceDrawerOpen();
          }}
        >
          {item.datasource_name || tDashboard("N/A")}
        </BodyMedium>
      </Table.Cell>
      <Table.Cell></Table.Cell>
    </Table.Row>
  );

  const renderSubsectorContent = (
    subsector: string,
    activities: ActivityDataByScope[],
  ) => {
    // Single activity - show directly
    if (activities.length === 1) {
      const item = activities[0];
      return renderActivityRow(item, item.activityTitle, true);
    }

    // Multiple activities - create manual accordion
    const totalEmissions = activities.reduce(
      (sum, item) => sum + Number(item.totalEmissions),
      0,
    );
    // Calculate correct percentage based on subsector total emissions relative to sector total
    const totalPercentage = (totalEmissions / sectorTotalEmissions) * 100;
    const uniqueSources = [
      ...new Set(activities.map((item) => item.datasource_name)),
    ];
    const sourceDisplay =
      uniqueSources.length === 1
        ? uniqueSources[0]
        : tDashboard("multiple-sources");
    const isExpanded = expandedSubsectors.has(subsector);

    return (
      <>
        <Table.Row
          key={subsector}
          cursor="pointer"
          onClick={() => toggleSubsector(subsector)}
          _hover={{ bg: "gray.50" }}
        >
          <Table.Cell>
            <BodyMedium color="content.secondary">
              {tData(toKebabCase(subsector))}
            </BodyMedium>
          </Table.Cell>
          <Table.Cell>
            <BodyMedium color="content.secondary">
              {convertKgToTonnes(totalEmissions)}
            </BodyMedium>
          </Table.Cell>
          <Table.Cell>
            <BodyMedium color="content.secondary">
              {totalPercentage.toFixed(1)}%
            </BodyMedium>
          </Table.Cell>
          {scopes.map((s) => (
            <Table.Cell key={s}>
              <BodyMedium color="content.secondary">
                {convertKgToTonnes(
                  activities.reduce(
                    (sum, item) => sum + Number(item.scopes[s] || 0),
                    0,
                  ),
                )}
              </BodyMedium>
            </Table.Cell>
          ))}
          <Table.Cell>
            <BodyMedium color="content.secondary">{sourceDisplay}</BodyMedium>
          </Table.Cell>
          <Table.Cell>
            <Icon
              as={LuChevronDown}
              transform={isExpanded ? "rotate(0deg)" : "rotate(-90deg)"}
              transition="transform 0.2s"
            />
          </Table.Cell>
        </Table.Row>
        {isExpanded &&
          activities.map((item, index) =>
            renderActivityRow(item, `${item.activityTitle}-${index}`),
          )}
      </>
    );
  };

  return (
    <Box py={4}>
      <Table.Root variant="line">
        <Table.Header textTransform="uppercase">
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
          <Table.ColumnHeader>
            <ButtonSmall>{tDashboard("source")}</ButtonSmall>
          </Table.ColumnHeader>
          <Table.ColumnHeader>
            {/* this is where the chevron is */}
          </Table.ColumnHeader>
        </Table.Header>
        <Table.Body>
          {Object.entries(groupedData).map(([subsector, activities]) =>
            renderSubsectorContent(subsector, activities),
          )}
        </Table.Body>
      </Table.Root>
      <ByScopeViewSourceDrawer
        sourceId={selectedSourceId}
        sector={{ sectorName }}
        isOpen={isSourceDrawerOpen}
        onClose={onSourceDrawerClose}
        t={tData}
        inventoryId={inventoryId}
      />
    </Box>
  );
};

export default ByScopeView;
