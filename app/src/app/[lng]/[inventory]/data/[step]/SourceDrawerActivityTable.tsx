import { DataSourceActivityDataRecord } from "@/app/[lng]/[inventory]/data/[step]/types";
import { TFunction } from "i18next";
import {
  AccordionItem,
  AccordionItemContent,
  AccordionItemTrigger,
  AccordionRoot,
} from "@/components/ui/accordion";
import { convertKgToTonnes } from "@/util/helpers";
import { HStack, Table, TableBody, TableCell } from "@chakra-ui/react";
import { BodyMedium } from "@/components/Texts/Body";
import { TitleSmall } from "@/components/Texts/Title";
import { Overline } from "@/components/Texts/Overline";

interface SourceDrawerActivityTableProps {
  activities: DataSourceActivityDataRecord[];
  t: TFunction;
}

export function SourceDrawerActivityTable({
  activities,
  t,
}: SourceDrawerActivityTableProps) {
  const getTotalEmissions = () => {
    const emissions = activities.reduce((acc, activity) => {
      return (
        acc +
        activity.gases.reduce((acc, gas) => {
          return acc + gas.emissions_value_100yr;
        }, 0)
      );
    }, 0);
    return convertKgToTonnes(emissions);
  };

  const columns = [
    "gas",
    "emissions",
    "activity-value",
    "emission-factor-value",
    "emission-factor-source",
  ];

  return (
    <AccordionRoot multiple>
      {activities.map((activity, i) => {
        return (
          <AccordionItem key={i} value={JSON.stringify(activity.activity_name)}>
            <AccordionItemTrigger>
              <HStack justify="space-between" width="full">
                <BodyMedium>
                  {t(activity.activity_name) +
                    " | " +
                    Object.values(activity.activity_subcategory_type)
                      .map((e) => t(e))
                      .join(" > ")}
                </BodyMedium>
                <TitleSmall>{`${t("total")} ${getTotalEmissions()}`}</TitleSmall>
              </HStack>
            </AccordionItemTrigger>
            <AccordionItemContent>
              <Table.Root>
                <Table.Header>
                  <Table.Row backgroundColor="background.neutral">
                    {columns.map((title) => (
                      <TableCell key={title}>
                        <Overline textTransform="uppercase">
                          {t(title)}
                        </Overline>
                      </TableCell>
                    ))}
                  </Table.Row>
                </Table.Header>
                <TableBody>
                  {activity.gases.map((gas) => {
                    return (
                      <Table.Row key={gas.gas_name}>
                        <Table.Cell>{t(gas.gas_name)}</Table.Cell>
                        <Table.Cell>
                          {convertKgToTonnes(gas.emissions_value_100yr)}
                        </Table.Cell>
                        <Table.Cell>
                          {`${gas.activity_value} ${t(activity.activity_units)}`}
                        </Table.Cell>
                        <Table.Cell>
                          {`${gas.emissionfactor_value} ${t("kg")}/${t(activity.activity_units)}`}
                        </Table.Cell>
                        <Table.Cell>
                          {t(gas.emissionfactor_source || "not-detailed")}
                        </Table.Cell>
                      </Table.Row>
                    );
                  })}
                </TableBody>
              </Table.Root>
            </AccordionItemContent>
          </AccordionItem>
        );
      })}
    </AccordionRoot>
  );
}
