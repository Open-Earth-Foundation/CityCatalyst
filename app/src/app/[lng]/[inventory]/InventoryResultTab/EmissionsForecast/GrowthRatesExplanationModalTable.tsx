import {
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@chakra-ui/react";
import { ISector, SECTORS } from "@/util/constants";
import { TFunction } from "i18next";
import { ProjectionData } from "@/util/types";

export const GrowthRatesExplanationModalTable = ({
  growthRates,
  t,
}: {
  growthRates: ProjectionData;
  t: TFunction;
}) => {
  function getNameTranslationString(
    sector: ISector | { name: string; color: string; referenceNumber: string },
  ) {
    return sector.name === "ippu" ? sector.name + "-short" : sector.name;
  }

  return (
    <Table variant={"striped"}>
      <TableContainer>
        <Thead>
          <Tr>
            <Th>{t("sector")}</Th>
            {Object.keys(growthRates)
              .slice(0, 4)
              .map((year) => (
                <Th key={year}>{year}</Th>
              ))}
            <Th>{"2030"}</Th>
            <Th>{"2050"}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {[
            ...SECTORS.slice(0, 4),
            ...Object.values(SECTORS[4].subSectors!),
          ].map((sector) => {
            return (
              <Tr key={sector.name}>
                <Td>{t(getNameTranslationString(sector))}</Td>
                {Object.keys(growthRates)
                  .slice(0, 4)
                  .map((year) => (
                    <Td key={year}>
                      {growthRates[year][sector.referenceNumber].toFixed(4)}
                    </Td>
                  ))}
                <Td>{growthRates["2030"][sector.referenceNumber]}</Td>
                <Td>{growthRates["2050"][sector.referenceNumber]}</Td>
              </Tr>
            );
          })}
        </Tbody>
      </TableContainer>
    </Table>
  );
};
