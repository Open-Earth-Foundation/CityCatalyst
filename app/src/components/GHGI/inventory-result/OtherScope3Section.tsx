import React from "react";
import { Box, Card, Table, Text } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { BodyMedium } from "@/components/package/Texts/Body";
import { ButtonSmall } from "@/components/package/Texts/Button";
import { api } from "@/services/api";
import { formatEmissionsOrRemoval } from "@/util/helpers";

/** Name of sector VI in the results API. It is not in SECTORS on purpose. */
const OTHER_SCOPE_3_SECTOR = "other-scope-3";

interface OtherScope3SectionProps {
  t: TFunction;
  inventoryId: string;
  numberFormat?: string;
}

/**
 * Read-only list of Other Scope 3 (VI.1) rows. GPC reports them apart from
 * BASIC and BASIC+, so nothing here is part of a total. Hidden when the
 * inventory has no such rows.
 */
const OtherScope3Section: React.FC<OtherScope3SectionProps> = ({
  t,
  inventoryId,
  numberFormat,
}) => {
  const { data } = api.useGetSectorBreakdownQuery({
    inventoryId,
    sector: OTHER_SCOPE_3_SECTOR,
  });
  const rows = data?.omittedFromTotal ?? [];
  if (rows.length === 0) {
    return null;
  }

  return (
    <Card.Root p={4} mt={6} data-testid="other-scope-3-section">
      <Card.Header>
        <Text fontFamily="heading" fontSize="title.md" fontWeight="medium">
          {t("other-scope-3")}
        </Text>
        <BodyMedium color="content.tertiary">
          {t("other-scope-3-not-in-total")}
        </BodyMedium>
      </Card.Header>
      <Card.Body>
        <Box py={4}>
          <Table.Root variant="line">
            <Table.Header textTransform="uppercase">
              <Table.Row>
                <Table.ColumnHeader>
                  <ButtonSmall>{t("gpc-reference")}</ButtonSmall>
                </Table.ColumnHeader>
                <Table.ColumnHeader>
                  <ButtonSmall>{t("emissions")}</ButtonSmall>
                </Table.ColumnHeader>
                <Table.ColumnHeader>
                  <ButtonSmall>{t("source")}</ButtonSmall>
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map((row, index) => (
                <Table.Row key={`${row.gpcReferenceNumber}-${index}`}>
                  <Table.Cell>
                    <BodyMedium color="content.secondary">
                      {row.gpcReferenceNumber}
                    </BodyMedium>
                  </Table.Cell>
                  <Table.Cell>
                    <BodyMedium color="content.secondary">
                      {formatEmissionsOrRemoval(
                        row.totalEmissions,
                        numberFormat,
                        t("removed"),
                      )}
                    </BodyMedium>
                  </Table.Cell>
                  <Table.Cell>
                    <BodyMedium color="content.secondary">
                      {row.datasource_name || t("no-cited-source")}
                    </BodyMedium>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      </Card.Body>
    </Card.Root>
  );
};

export default OtherScope3Section;
