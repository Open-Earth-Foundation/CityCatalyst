import React, { useState } from "react";
import Decimal from "decimal.js";
import { Box, Table, useDisclosure, Icon } from "@chakra-ui/react";
import { ActivityDataByScope } from "@/util/types";
import type { TFunction } from "i18next";
import {
  formatEmissionsOrRemoval,
  formatNumber,
  toKebabCase,
} from "@/util/helpers";
import { InventoryTypeEnum, SECTORS } from "@/util/constants";
import { ButtonSmall } from "@/components/package/Texts/Button";
import { BodyMedium } from "@/components/package/Texts/Body";
import ByScopeViewSourceDrawer from "./ByScopeViewSourceDrawer";
import { LuChevronDown } from "react-icons/lu";

interface ByScopeViewProps {
  data: ActivityDataByScope[];
  /** sum of non-negative (emissions-only) totalEmissions across `data` - % denominator, see CC-749 */
  grossTotalEmissions: Decimal;
  tData: TFunction;
  tDashboard: TFunction;
  sectorName: string;
  inventoryType?: InventoryTypeEnum;
  inventoryId: string;
  numberFormat?: string;
}

const ByScopeView: React.FC<ByScopeViewProps> = ({
  data,
  grossTotalEmissions,
  tData,
  tDashboard,
  sectorName,
  inventoryType,
  inventoryId,
  numberFormat,
}) => {
  const scopes = inventoryType
    ? SECTORS.find((s) => sectorName === s.name)!.inventoryTypes[inventoryType]
        .scopes
    : [];
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

  const hasRemoval = data.some((item) => item.percentage === null);

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
          {formatEmissionsOrRemoval(
            item.totalEmissions,
            numberFormat,
            tDashboard("removed"),
          )}
        </BodyMedium>
      </Table.Cell>
      <Table.Cell>
        <BodyMedium color="content.secondary">
          {item.percentage === null ? "*" : `${item.percentage}%`}
        </BodyMedium>
      </Table.Cell>
      {scopes.map((s) => (
        <Table.Cell key={s}>
          <BodyMedium color="content.secondary">
            {formatEmissionsOrRemoval(
              item.scopes[s] || 0,
              numberFormat,
              tDashboard("removed"),
            )}
          </BodyMedium>
        </Table.Cell>
      ))}
      <Table.Cell>
        {item.datasource_name ? (
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
            {item.datasource_name}
          </BodyMedium>
        ) : (
          <BodyMedium color="content.secondary">
            {tDashboard("no-cited-source")}
          </BodyMedium>
        )}
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
      (sum, item) => sum.plus(new Decimal(item.totalEmissions)),
      new Decimal(0),
    );
    // The API only returns a percentage per subsector+datasource group (one entry
    // per `activities` item here); this re-aggregates across datasources for the
    // subsector as a whole, so it mirrors ResultsService.ts's calculatePercentage
    // (gross-emissions denominator, null for removals) rather than duplicating it.
    const totalPercentage = totalEmissions.isNegative()
      ? null
      : grossTotalEmissions.lessThanOrEqualTo(0)
        ? 0
        : totalEmissions
            .times(100)
            .div(grossTotalEmissions)
            .round()
            .toNumber();
    const uniqueSources = [
      ...new Set(activities.map((item) => item.datasource_name)),
    ];
    const sourceDisplay =
      uniqueSources.length === 1
        ? uniqueSources[0]
        : tDashboard("multiple-sources");
    const isExpanded = expandedSubsectors.has(subsector);

    return (
      <React.Fragment key={subsector}>
        <Table.Row
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
              {formatEmissionsOrRemoval(
                totalEmissions,
                numberFormat,
                tDashboard("removed"),
              )}
            </BodyMedium>
          </Table.Cell>
          <Table.Cell>
            <BodyMedium color="content.secondary">
              {totalPercentage === null
                ? "*"
                : `${formatNumber(totalPercentage, numberFormat, 1)}%`}
            </BodyMedium>
          </Table.Cell>
          {scopes.map((s) => (
            <Table.Cell key={s}>
              <BodyMedium color="content.secondary">
                {formatEmissionsOrRemoval(
                  activities.reduce(
                    (sum, item) => sum.plus(new Decimal(item.scopes[s] || 0)),
                    new Decimal(0),
                  ),
                  numberFormat,
                  tDashboard("removed"),
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
      </React.Fragment>
    );
  };

  return (
    <Box py={4}>
      <Table.Root variant="line">
        <Table.Header textTransform="uppercase">
          <Table.Row>
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
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {Object.entries(groupedData).map(([subsector, activities]) =>
            renderSubsectorContent(subsector, activities),
          )}
        </Table.Body>
      </Table.Root>
      {hasRemoval && (
        <BodyMedium color="content.tertiary" pt={2}>
          {tDashboard("removals-not-countable-footnote")}
        </BodyMedium>
      )}
      <ByScopeViewSourceDrawer
        sourceId={selectedSourceId}
        sector={{ sectorName }}
        isOpen={isSourceDrawerOpen}
        onClose={onSourceDrawerClose}
        t={tData}
        inventoryId={inventoryId}
        numberFormat={numberFormat}
      />
    </Box>
  );
};

export default ByScopeView;
