import React from "react";
import { Box, Heading, HStack, Text } from "@chakra-ui/react";
import { capitalizeFirstLetter, convertKgToTonnes } from "@/util/helpers";
import ByActivityViewTable from "@/app/[lng]/[inventory]/InventoryResultTab/ByActivityViewTable";
import type { TFunction } from "i18next";
import type { SectorBreakdownResponse } from "@/util/types";
import {
  AccordionItem,
  AccordionItemContent,
  AccordionItemTrigger,
  AccordionRoot,
} from "@/components/ui/accordion";

interface EmissionsBreakdownByActivityProps {
  tData: TFunction;
  tDashboard: TFunction;
  sectorName: string;
  sectorBreakdown: SectorBreakdownResponse;
}

export const ByActivityView: React.FC<EmissionsBreakdownByActivityProps> = ({
  tData,
  tDashboard,
  sectorName,
  sectorBreakdown,
}) => {
  return (
    <AccordionRoot>
      {Object.entries(sectorBreakdown!.byActivity || {}).map(
        ([subSector, values]) => {
          const consumptions = Object.entries(
            values.totals?.totalActivityValueByUnit || {},
          ).filter(([unit, _value]) => unit !== "N/A");

          const consumptionOrMassOfWasteTitle =
            sectorName !== "waste" ? "consumption" : "mass-of-waste";
          return (
            <AccordionItem key={subSector} value={subSector}>
              <AccordionItemTrigger
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <HStack
                  style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <Box
                    display="flex"
                    alignItems="flex-start"
                    justifyContent="space-between"
                    width="100%"
                  >
                    <Heading size="sm">{tData(subSector)} </Heading>
                    <HStack alignItems="flex-start" gap={4}>
                      <Heading size="sm">
                        {capitalizeFirstLetter(
                          tDashboard(consumptionOrMassOfWasteTitle),
                        )}
                        :{" "}
                      </Heading>
                      <Box>
                        {consumptions.length <= 0 ? (
                          <Text>{tDashboard("N/A")}</Text>
                        ) : (
                          consumptions.map(([unit, value]) => (
                            <Text key={unit}>
                              {value} {tData(unit)}
                            </Text>
                          ))
                        )}
                      </Box>
                      <Heading size="sm">
                        {capitalizeFirstLetter(tDashboard("emissions"))}:{" "}
                      </Heading>
                      <Text>
                        {convertKgToTonnes(
                          BigInt(values.totals?.totalActivityEmissions),
                        )}
                      </Text>
                    </HStack>
                  </Box>
                </HStack>
              </AccordionItemTrigger>
              <AccordionItemContent>
                <ByActivityViewTable
                  data={values}
                  tData={tData}
                  tDashboard={tDashboard}
                  sectorName={sectorName}
                />
              </AccordionItemContent>
            </AccordionItem>
          );
        },
      )}
    </AccordionRoot>
  );
};
