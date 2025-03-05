import { Table } from "@chakra-ui/react";
import { ISector, SECTORS } from "@/util/constants";
import { TFunction } from "i18next";
import { ProjectionData } from "@/util/types";
import { ButtonSmall } from "@/components/Texts/Button";

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

  // for emission growth rates, sector V is split between its subsectors
  const emissionsSectors = [
    ...SECTORS.slice(0, 4),
    ...Object.values(SECTORS[4]!.subSectors!),
  ];

  return (
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeader>
            <ButtonSmall textTransform="uppercase">{t("sector")}</ButtonSmall>
          </Table.ColumnHeader>
          {Object.keys(growthRates)
            .slice(0, 4)
            .map((year) => (
              <Table.ColumnHeader key={year}>
                <ButtonSmall textTransform="uppercase">{year}</ButtonSmall>
              </Table.ColumnHeader>
            ))}
          <Table.ColumnHeader>
            <ButtonSmall textTransform="uppercase">{"2030"}</ButtonSmall>
          </Table.ColumnHeader>
          <Table.ColumnHeader>
            <ButtonSmall textTransform="uppercase">{"2050"}</ButtonSmall>
          </Table.ColumnHeader>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {emissionsSectors.map((sector) => (
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
