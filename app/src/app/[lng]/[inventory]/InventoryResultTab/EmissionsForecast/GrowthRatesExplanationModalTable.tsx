import { Table } from "@chakra-ui/react";
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
    <Table.Root unstyled>
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeader>{t("sector")}</Table.ColumnHeader>
          {Object.keys(growthRates)
            .slice(0, 4)
            .map((year) => (
              <Table.ColumnHeader key={year}>{year}</Table.ColumnHeader>
            ))}
          <Table.ColumnHeader>{"2030"}</Table.ColumnHeader>
          <Table.ColumnHeader>{"2050"}</Table.ColumnHeader>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {SECTORS.map((sector) => (
          <Table.Row key={sector.name}>
            <Table.Cell>{t(getNameTranslationString(sector))}</Table.Cell>
            {Object.keys(growthRates)
              .slice(0, 4)
              .map((year) => (
                <Table.Cell key={year}>
                  {growthRates[year][sector.referenceNumber]}
                </Table.Cell>
              ))}
            <Table.Cell>
              {growthRates["2030"][sector.referenceNumber]}
            </Table.Cell>
            <Table.Cell>
              {growthRates["2050"][sector.referenceNumber]}
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
};
