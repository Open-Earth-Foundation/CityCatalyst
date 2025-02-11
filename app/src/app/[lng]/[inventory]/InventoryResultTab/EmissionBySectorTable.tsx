import { SectorEmission } from "@/util/types";
import { Accordion, Box, Icon, Table, Text } from "@chakra-ui/react";
import { convertKgToTonnes } from "@/util/helpers";
import React from "react";
import { useTranslation } from "@/i18n/client";
import { MdArrowDropDown, MdArrowDropUp } from "react-icons/md";
import { toKebabCaseModified } from "@/app/[lng]/[inventory]/InventoryResultTab/index";
import {
  AccordionItem,
  AccordionItemContent,
  AccordionItemTrigger,
  AccordionRoot,
} from "@/components/ui/accordion";

interface EmissionBySectorTableProps {
  data: {
    bySector: ExtendedSectorEmission[];
    year: number;
    inventoryId: string;
  }[];

  lng: string;
}

type ExtendedSectorEmission = SectorEmission & {
  percentageChange: number | null;
  totalInventoryPercentage: number | null;
};

const EmissionBySectorTableSection: React.FC<EmissionBySectorTableProps> = ({
  data,
  lng,
}) => {
  const { t: tData } = useTranslation(lng, "data");

  const renderTable = (item: {
    bySector: ExtendedSectorEmission[];
    year: number;
    inventoryId: string;
  }) => {
    return (
      <Table.Root
        unstyled
        borderLeft="0px"
        borderBottom="0px"
        borderRight="0px"
        borderWidth="1px"
        borderRadius="20px"
      >
        <Table.Header backgroundColor="background.backgroundLight">
          <Table.Row>
            <Table.ColumnHeader>{tData("sector")}</Table.ColumnHeader>
            <Table.ColumnHeader>{tData("emissions")}</Table.ColumnHeader>
            <Table.ColumnHeader>
              {tData("percentage-emissions")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {tData("based-on-previous-year")}
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {item.bySector?.map((sectorBreakDown, i) => {
            const hasNonZero =
              sectorBreakDown.percentageChange !== 0 &&
              sectorBreakDown.percentageChange != null;

            let previousYearDifference = "N/A";
            if (sectorBreakDown.percentageChange != null) {
              previousYearDifference =
                sectorBreakDown.percentageChange.toFixed(0) + "%";
            }

            return (
              <Table.Row key={i} truncate>
                <Table.Cell>
                  {tData(toKebabCaseModified(sectorBreakDown.sectorName))}
                </Table.Cell>
                <Table.Cell>
                  {convertKgToTonnes(sectorBreakDown.co2eq)}
                </Table.Cell>
                <Table.Cell>
                  {sectorBreakDown.totalInventoryPercentage}%
                </Table.Cell>
                <Table.Cell
                  className="flex items-center"
                  color={
                    (sectorBreakDown.percentageChange ?? 0) < 0
                      ? "sentiment.positiveDefault"
                      : hasNonZero
                        ? "sentiment.negativeDefault"
                        : "black"
                  }
                >
                  {sectorBreakDown.percentageChange != null &&
                    hasNonZero &&
                    (sectorBreakDown.percentageChange < 0 ? (
                      <Icon as={MdArrowDropDown} />
                    ) : (
                      <Icon as={MdArrowDropUp} />
                    ))}
                  <Text>{previousYearDifference}</Text>
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    );
  };

  return (
    <Box>
      {data.map((item) => (
        <AccordionRoot key={item.inventoryId} tabIndex={0} multiple>
          <AccordionItem
            value=""
            backgroundColor="white"
            borderWidth="1px"
            padding="0px"
            borderColor="border.overlay"
          >
            <h2>
              <AccordionItemTrigger padding="0px">
                <Box
                  display="flex"
                  justifyContent="space-between"
                  w="full"
                  padding="24px"
                  alignItems="center"
                >
                  <Box
                    display="flex"
                    flexDir="column"
                    alignItems="start"
                    gap="8px"
                  >
                    <Text
                      fontFamily="heading"
                      fontSize="title.md"
                      fontWeight="semibold"
                    >
                      {item.year}
                    </Text>
                  </Box>
                  <Box display="flex" alignItems="center" gap="6">
                    <Box alignItems="start" display="flex" fontFamily="heading">
                      <Text fontWeight="medium">
                        {tData("emissions")}:&nbsp;
                      </Text>
                      <Text fontWeight="normal">
                        {convertKgToTonnes(
                          item.bySector.reduce(
                            (acc, curr) => acc + BigInt(curr.co2eq as bigint),
                            0n,
                          ),
                        )}{" "}
                      </Text>
                    </Box>
                  </Box>
                </Box>
              </AccordionItemTrigger>
            </h2>
            <AccordionItemContent padding="0px" pb={4}>
              {renderTable(item)}
            </AccordionItemContent>
          </AccordionItem>
        </AccordionRoot>
      ))}
    </Box>
  );
};

export default EmissionBySectorTableSection;
