import {
  Box,
  Grid,
  Icon,
  Text,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { Control } from "react-hook-form";
import FormattedNumberInput from "@/components/formatted-number-input";
import { Field } from "@/components/ui/field";
import { MdWarning } from "react-icons/md";
import { BodyMedium } from "@/components/Texts/Body";

interface DirectMeasureSectionProps {
  t: TFunction;
  control: Control<any, any>;
  errors: Record<string, any>;
  isDirectMeasure: boolean;
}

export const DirectMeasureSection = ({
  t,
  control,
  errors,
  isDirectMeasure,
}: DirectMeasureSectionProps) => {
  if (!isDirectMeasure) {
    return null;
  }

  return (
    <Grid templateColumns="repeat(2, 1fr)" gap={4} mb={5}>
      <Field w="full" label={t("emissions-value-co2")}>
        <FormattedNumberInput
          testId="co2-emission-factor"
          t={t}
          control={control}
          miniAddon
          name="activity.CO2EmissionFactor"
          defaultValue="0"
        >
          <Text truncate lineClamp={1} w="full" textAlign="center">
            tCO2
          </Text>
        </FormattedNumberInput>
        {errors?.activity?.["CO2EmissionFactor"] && (
          <Box display="flex" gap="6px" alignItems="center" mt="6px">
            <Icon as={MdWarning} color="sentiment.negativeDefault" />
            <BodyMedium>
              {t(
                errors?.activity?.["CO2EmissionFactor"]
                  ?.message as string,
              )}
            </BodyMedium>
          </Box>
        )}
      </Field>
      <Field w="full" label={t("emissions-value-n2o")}>
        <FormattedNumberInput
          testId="n2o-emission-factor"
          t={t}
          control={control}
          miniAddon
          name={`activity.N2OEmissionFactor`}
          defaultValue="0"
        >
          <Text truncate lineClamp={1} w="full" textAlign="center">
            tN2O
          </Text>
        </FormattedNumberInput>
        {errors?.activity?.["N2OEmissionFactor"] && (
          <Box display="flex" gap="6px" alignItems="center" mt="6px">
            <Icon as={MdWarning} color="sentiment.negativeDefault" />
            <BodyMedium>
              {errors?.activity?.["N2OEmissionFactor"]?.message}
            </BodyMedium>
          </Box>
        )}
      </Field>
      <Field w="full" label={t("emissions-value-ch4")}>
        <FormattedNumberInput
          testId="ch4-emission-factor"
          t={t}
          control={control}
          miniAddon
          name={`activity.CH4EmissionFactor`}
          defaultValue="0"
        >
          <Text truncate lineClamp={1} w="full" textAlign="center">
            tCH4
          </Text>
        </FormattedNumberInput>
        {errors?.activity?.["CH4EmissionFactor"] && (
          <Box display="flex" gap="6px" alignItems="center" mt="6px">
            <Icon as={MdWarning} color="sentiment.negativeDefault" />
            <BodyMedium>
              {errors?.activity?.["CH4EmissionFactor"]?.message}
            </BodyMedium>
          </Box>
        )}
      </Field>
    </Grid>
  );
};