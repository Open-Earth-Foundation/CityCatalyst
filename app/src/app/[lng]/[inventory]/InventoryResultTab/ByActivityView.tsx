import React from "react";
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Heading,
  HStack,
  Text,
} from "@chakra-ui/react";
import { capitalizeFirstLetter, convertKgToTonnes } from "@/util/helpers";
import ByActivityViewTable from "@/app/[lng]/[inventory]/InventoryResultTab/ByActivityViewTable";
import type { TFunction } from "i18next";
import type { SectorBreakdownResponse } from "@/util/types";

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
    <Accordion>
      {Object.entries(sectorBreakdown!.byActivity || {}).map(
        ([subSector, values]) => {
          const consumptions = Object.entries(
            values.totals?.totalActivityValueByUnit || {},
          ).filter(([unit, _value]) => unit !== "N/A");

          const consumptionOrMassOfWasteTitle =
            sectorName !== "waste" ? "consumption" : "mass-of-waste";
          return (
            <AccordionItem key={subSector}>
              <AccordionButton
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <HStack
                  sx={{
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
                    <Heading size="title.sm">{tData(subSector)} </Heading>
                    <HStack alignItems="flex-start" spacing={4}>
                      <Heading size="title.sm">
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
                      <Heading size="title.sm">
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
                <AccordionIcon />
              </AccordionButton>
              <AccordionPanel>
                <ByActivityViewTable
                  data={values}
                  tData={tData}
                  tDashboard={tDashboard}
                  sectorName={sectorName}
                />
              </AccordionPanel>
            </AccordionItem>
          );
        },
      )}
    </Accordion>
  );
};
