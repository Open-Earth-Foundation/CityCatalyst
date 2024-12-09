import { SectorEmission } from "@/util/types";
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Icon,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
} from "@chakra-ui/react";
import { convertKgToTonnes } from "@/util/helpers";
import React from "react";
import { useTranslation } from "@/i18n/client";
import { MdArrowDropDown, MdArrowDropUp } from "react-icons/md";
import { toKebabCaseModified } from "@/app/[lng]/[inventory]/InventoryResultTab/index";

interface EmissionBySectorTableProps {
  data: {
    bySector: SectorEmission[];
    year: number;
    inventoryId: string;
  }[];

  lng: string;
}

const EmissionBySectorTableSection: React.FC<EmissionBySectorTableProps> = ({
  data,
  lng,
}) => {
  const { t: tData } = useTranslation(lng, "data");

  const renderTable = (item: {
    bySector: SectorEmission[];
    year: number;
    inventoryId: string;
  }) => {
    return (
      <TableContainer px={0}>
        <Table
          variant="simple"
          borderLeft="0px"
          borderBottom="0px"
          borderRight="0px"
          borderWidth="1px"
          borderRadius="20px"
        >
          <Thead backgroundColor="background.backgroundLight">
            <Tr>
              <Th>{tData("sector")}</Th>
              <Th>{tData("emissions")}</Th>
              <Th>{tData("percentage-emissions")}</Th>
              <Th>{tData("based-on-previous-year")}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {item.bySector?.map((sectorBreakDown, i) => {
              return (
                <Tr key={i} isTruncated>
                  <Td>
                    {tData(toKebabCaseModified(sectorBreakDown.sectorName))}
                  </Td>
                  <Td>{convertKgToTonnes(sectorBreakDown.co2eq)}</Td>
                  <Td>{sectorBreakDown.percentage}%</Td>
                  <Td
                    className="flex items-center"
                    color={
                      sectorBreakDown.percentage < 0
                        ? "sentiment.positiveDefault"
                        : "sentiment.negativeDefault"
                    }
                  >
                    {sectorBreakDown.percentage < 0 ? (
                      <Icon as={MdArrowDropDown} />
                    ) : (
                      <Icon as={MdArrowDropUp} />
                    )}
                    <Text>{sectorBreakDown.percentage.toFixed(0)}%</Text>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </TableContainer>
    );
  };

  return (
    <Box>
      {data.map((item) => (
        <Accordion key={item.inventoryId} defaultIndex={[0]} allowMultiple>
          <AccordionItem
            backgroundColor="white"
            borderWidth="1px"
            padding="0px"
            borderColor="border.overlay"
          >
            <h2>
              <AccordionButton padding="0px">
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
                <AccordionIcon
                  color="interactive.control"
                  marginRight="24px"
                  boxSize="40px"
                />
              </AccordionButton>
            </h2>
            <AccordionPanel padding="0px" pb={4}>
              {renderTable(item)}
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      ))}
    </Box>
  );
};

export default EmissionBySectorTableSection;
