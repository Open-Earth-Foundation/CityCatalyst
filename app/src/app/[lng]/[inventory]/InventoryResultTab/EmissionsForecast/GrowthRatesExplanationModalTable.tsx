import {
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@chakra-ui/react";
import { SECTORS } from "@/util/constants";
import { TFunction } from "i18next";
import { ProjectionData } from "@/util/types";

export const GrowthRatesExplanationModalTable = ({
  growthRates,
  t,
}: {
  growthRates: ProjectionData;
  t: TFunction;
}) => {
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
          {SECTORS.map((sector) => (
            <Tr key={sector.name}>
              <Td>{t(sector.name + "-short")}</Td>
              {Object.keys(growthRates)
                .slice(0, 4)
                .map((year) => (
                  <Td key={year}>
                    {growthRates[year][sector.referenceNumber]}
                  </Td>
                ))}
              <Td>{growthRates["2030"][sector.referenceNumber]}</Td>
              <Td>{growthRates["2050"][sector.referenceNumber]}</Td>
            </Tr>
          ))}
        </Tbody>
      </TableContainer>
    </Table>
  );
};
