import { Box, HStack, Heading, Icon, Spinner, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { Control } from "react-hook-form";
import FormattedNumberInput from "@/components/formatted-number-input";
import { Field } from "@/components/ui/field";
import { MdWarning } from "react-icons/md";
import { BodyMedium } from "@/components/package/Texts/Body";
import LabelLarge from "@/components/package/Texts/Label";

interface EmissionFactorsSectionProps {
  t: TFunction;
  control: Control<any, any>;
  errors: Record<string, any>;
  isDirectMeasure: boolean;
  hideEmissionFactors?: boolean;
  isEmissionFactorInputDisabled: boolean;
  emissionFactorUnits: string;
  areEmissionFactorsLoading: boolean;
}

export const EmissionFactorsSection = ({
  t,
  control,
  errors,
  isDirectMeasure,
  hideEmissionFactors,
  isEmissionFactorInputDisabled,
  emissionFactorUnits,
  areEmissionFactorsLoading,
}: EmissionFactorsSectionProps) => {
  if (isDirectMeasure || hideEmissionFactors) {
    return null;
  }

  return (
    <>
      <Heading
        size="sm"
        mb={4}
        fontWeight="normal"
        display="flex"
        alignItems="center"
      >
        <LabelLarge fontWeight="medium">
          {t("emissions-factor-values")}
        </LabelLarge>
      </Heading>
      <HStack alignItems="flex-start" gap={4} mb={5}>
        <Box>
          <Field label={t("co2-emission-factor")}>
            <FormattedNumberInput
              miniAddon
              t={t}
              control={control}
              name="activity.CO2EmissionFactor"
              defaultValue="0"
              w="110px"
              isDisabled={isEmissionFactorInputDisabled}
            >
              {areEmissionFactorsLoading ? (
                <Spinner size="sm" color="border.neutral" />
              ) : (
                <Text truncate lineClamp={1} w="full" textAlign="center">
                  {emissionFactorUnits}
                </Text>
              )}
            </FormattedNumberInput>
          </Field>
          {errors?.activity?.["CO2EmissionFactor"] ? (
            <Box display="flex" gap="6px" alignItems="center" mt="6px">
              <Icon as={MdWarning} color="sentiment.negativeDefault" />
              <BodyMedium>
                {errors?.activity?.["CO2EmissionFactor"]?.message}
              </BodyMedium>
            </Box>
          ) : (
            <Box
              display="flex"
              gap="6px"
              alignItems="center"
              mt="6px"
              h="16px"
            />
          )}
        </Box>
        <Field label={t("n2o-emission-factor")}>
          <FormattedNumberInput
            miniAddon
            t={t}
            control={control}
            name="activity.N2OEmissionFactor"
            defaultValue="0"
            isDisabled={isEmissionFactorInputDisabled}
          >
            {areEmissionFactorsLoading ? (
              <Spinner size="sm" color="border.neutral" />
            ) : (
              <Text truncate lineClamp={1} w="full" textAlign="center">
                {emissionFactorUnits}
              </Text>
            )}
          </FormattedNumberInput>
          {errors?.activity?.["N2OEmissionFactor"] ? (
            <Box display="flex" gap="6px" alignItems="center" mt="6px">
              <Icon as={MdWarning} color="sentiment.negativeDefault" />
              <BodyMedium>
                {errors?.activity?.["N2OEmissionFactor"]?.message}
              </BodyMedium>
            </Box>
          ) : (
            <Box
              display="flex"
              gap="6px"
              alignItems="center"
              mt="6px"
              h="16px"
            />
          )}
        </Field>
        <Field label={t("ch4-emission-factor")}>
          <FormattedNumberInput
            control={control}
            miniAddon
            t={t}
            name="activity.CH4EmissionFactor"
            defaultValue="0"
            isDisabled={isEmissionFactorInputDisabled}
          >
            {areEmissionFactorsLoading ? (
              <Spinner size="sm" color="border.neutral" />
            ) : (
              <Text truncate lineClamp={1} w="full" textAlign="center">
                {emissionFactorUnits}
              </Text>
            )}
          </FormattedNumberInput>
          {errors?.activity?.["CH4EmissionFactor"] ? (
            <Box display="flex" gap="6px" alignItems="center" mt="6px">
              <Icon as={MdWarning} color="sentiment.negativeDefault" />
              <BodyMedium>
                {errors?.activity?.["CH4EmissionFactor"]?.message}
              </BodyMedium>
            </Box>
          ) : (
            <Box
              display="flex"
              gap="6px"
              alignItems="center"
              mt="6px"
              h="16px"
            />
          )}
        </Field>
      </HStack>
    </>
  );
};
