import React, { useState } from "react";
import { TFunction } from "i18next";
import { Trans } from "react-i18next";
import { Badge, Box, Text, VStack } from "@chakra-ui/react";
import { Radio, RadioGroup } from "@/components/ui/radio";
import InventoryDetailsHeader from "./inventory-details-header";
import ThirdPartySourcesDrawer from "./ThirdPartySourcesDrawer";

export const THIRD_PARTY_DATA_FILL_YES = "yes";
export const THIRD_PARTY_DATA_FILL_NO = "no";

interface ThirdPartyInventoryDataStepProps {
  t: TFunction;
  cityId: string;
  year: number;
  inventoryType?: string;
  value?: string | null;
  onValueChange?: (value: string) => void;
}

export default function ThirdPartyInventoryDataStep({
  t,
  cityId,
  year,
  inventoryType,
  value: controlledValue,
  onValueChange,
}: ThirdPartyInventoryDataStepProps) {
  const [internalValue, setInternalValue] = useState<string | null>(null);
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;

  const handleValueChange = (details: { value: string | null }) => {
    const next = details.value;
    if (!next) return;
    if (!isControlled) {
      setInternalValue(next);
    }
    onValueChange?.(next);
  };

  return (
    <Box w="full">
      <InventoryDetailsHeader t={t} />
      <Box
        w="full"
        my="32px"
        borderWidth="1px"
        borderStyle="solid"
        borderColor="border.overlay"
        borderRadius="10px"
      >
        <VStack w="full" alignItems="flex-start" py="32px" px="40px" gap="24px">
          <Text
            fontSize="body.lg"
            fontStyle="normal"
            fontWeight="semibold"
            letterSpacing="wide"
          >
            {t("third-party-inventory-data-input-label")}
          </Text>

          <RadioGroup
            value={value ?? undefined}
            onValueChange={handleValueChange}
            w="full"
          >
            <VStack align="stretch" gap="32px" w="full">
              <Radio
                variant="filled"
                value={THIRD_PARTY_DATA_FILL_YES}
                alignItems="flex-start"
              >
                <VStack align="flex-start" gap="8px" flex={1}>
                  <Box
                    display="flex"
                    flexWrap="wrap"
                    alignItems="center"
                    gap="12px"
                  >
                    <Text
                      fontSize="title.md"
                      fontWeight="semibold"
                      color="content.primary"
                      fontFamily="body"
                    >
                      {t("third-party-inventory-data-yes-label")}
                    </Text>
                    <Badge
                      borderWidth="1px"
                      borderColor="border.neutral"
                      py="4px"
                      px="12px"
                      borderRadius="30px"
                      bg="base.light"
                      fontSize="body.sm"
                      fontWeight="medium"
                      color="content.secondary"
                    >
                      <Trans
                        t={t}
                        i18nKey="third-party-inventory-data-yes-badge"
                        components={{
                          1: (
                            <Text
                              as="span"
                              color="interactive.quaternary"
                              fontWeight="bold"
                            />
                          ),
                        }}
                      />
                    </Badge>
                  </Box>
                  <Text
                    fontSize="body.md"
                    color="content.tertiary"
                    fontFamily="body"
                  >
                    {t("third-party-inventory-data-yes-description")}
                  </Text>
                  <ThirdPartySourcesDrawer
                    t={t}
                    cityId={cityId}
                    year={year}
                    inventoryType={inventoryType}
                  />
                </VStack>
              </Radio>

              <Radio
                variant="filled"
                value={THIRD_PARTY_DATA_FILL_NO}
                alignItems="flex-start"
              >
                <VStack align="flex-start" gap="8px" flex={1}>
                  <Text
                    fontSize="body.lg"
                    fontWeight="semibold"
                    color="content.primary"
                    fontFamily="body"
                  >
                    {t("third-party-inventory-data-no-label")}
                  </Text>
                  <Text
                    fontSize="body.md"
                    color="content.tertiary"
                    fontFamily="body"
                  >
                    {t("third-party-inventory-data-no-description")}
                  </Text>
                </VStack>
              </Radio>
            </VStack>
          </RadioGroup>
        </VStack>
      </Box>
    </Box>
  );
}
