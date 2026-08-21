import { Box, Grid, HStack, Icon } from "@chakra-ui/react";
import { TFunction } from "i18next";
import React from "react";
import {
  Control,
  Controller,
  FieldErrors,
  FieldValues,
  UseFormSetValue,
} from "react-hook-form";
import FormattedNumberInput from "@/components/formatted-number-input";
import { Field } from "@/components/ui/field";
import { MdWarning } from "react-icons/md";
import { BodyMedium } from "@/components/package/Texts/Body";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";
import { Inputs } from "../activity-modal-body";

interface DirectMeasureSectionProps {
  t: TFunction;
  control: Control<FieldValues>;
  errors: FieldErrors<FieldValues>;
  isDirectMeasure: boolean;
  setValue: UseFormSetValue<Inputs>;
}

export const DirectMeasureSection = ({
  t,
  control,
  errors,
  isDirectMeasure,
  setValue,
}: DirectMeasureSectionProps) => {
  const activityErrors = errors?.activity as
    | Record<string, { message?: string } | undefined>
    | undefined;

  if (!isDirectMeasure) {
    return null;
  }

  return (
    <Grid templateColumns="repeat(2, 1fr)" gap={4} mb={5}>
      <Field w="full" label={t("emissions-value-co2")}>
        <HStack>
          <FormattedNumberInput
            testId="co2-emission-factor"
            t={t}
            control={control}
            miniAddon
            name="activity.CO2EmissionFactor"
            defaultValue="0"
            flex={2}
          />
          <Controller
            rules={{ required: t("option-required") }}
            control={control}
            name="activity.co2EmissionFactorUnit"
            render={({ field }) => (
              <NativeSelectRoot
                {...field}
                borderRadius="4px"
                borderWidth={
                  activityErrors?.["co2EmissionFactorUnit"] ? "1px" : 0
                }
                border="inputBox"
                h="42px"
                shadow="1dp"
                borderColor={
                  activityErrors?.["co2EmissionFactorUnit"]
                    ? "sentiment.negativeDefault"
                    : ""
                }
                background={
                  activityErrors?.["co2EmissionFactorUnit"]
                    ? "sentiment.negativeOverlay"
                    : ""
                }
                _focus={{
                  borderWidth: "1px",
                  shadow: "none",
                  borderColor: "content.link",
                }}
                bgColor="base.light"
                onChange={(e: React.ChangeEvent<HTMLDivElement>) => {
                  const value = (e.target as unknown as HTMLSelectElement).value;
                  field.onChange(value);
                  setValue("activity.co2EmissionFactorUnit", value);
                }}
              >
                <NativeSelectField
                  placeholder={t("select-unit")}
                  defaultValue={field.value}
                >
                  <option value="units-kilograms">
                    {t("units-kilograms")}
                  </option>
                  <option value="units-tonnes">{t("units-tonnes")}</option>
                </NativeSelectField>
              </NativeSelectRoot>
            )}
          />
        </HStack>
        {activityErrors?.["CO2EmissionFactor"] && (
          <Box display="flex" gap="6px" alignItems="center" mt="6px">
            <Icon as={MdWarning} color="sentiment.negativeDefault" />
            <BodyMedium>
              {t(activityErrors?.["CO2EmissionFactor"]?.message as string)}
            </BodyMedium>
          </Box>
        )}
        {activityErrors?.["co2EmissionFactorUnit"] &&
          !activityErrors?.["CO2EmissionFactor"] && (
            <Box display="flex" gap="6px" alignItems="center" mt="6px">
              <Icon as={MdWarning} color="sentiment.negativeDefault" />
              <BodyMedium>
                {activityErrors?.["co2EmissionFactorUnit"]?.message}
              </BodyMedium>
            </Box>
          )}
      </Field>
      <Field w="full" label={t("emissions-value-n2o")}>
        <HStack>
          <FormattedNumberInput
            testId="n2o-emission-factor"
            t={t}
            control={control}
            miniAddon
            name="activity.N2OEmissionFactor"
            defaultValue="0"
            flex={2}
          />
          <Controller
            rules={{ required: t("option-required") }}
            control={control}
            name="activity.n2oEmissionFactorUnit"
            render={({ field }) => (
              <NativeSelectRoot
                {...field}
                borderRadius="4px"
                borderWidth={
                  activityErrors?.["n2oEmissionFactorUnit"] ? "1px" : 0
                }
                border="inputBox"
                h="42px"
                shadow="1dp"
                borderColor={
                  activityErrors?.["n2oEmissionFactorUnit"]
                    ? "sentiment.negativeDefault"
                    : ""
                }
                background={
                  activityErrors?.["n2oEmissionFactorUnit"]
                    ? "sentiment.negativeOverlay"
                    : ""
                }
                _focus={{
                  borderWidth: "1px",
                  shadow: "none",
                  borderColor: "content.link",
                }}
                bgColor="base.light"
                onChange={(e: React.ChangeEvent<HTMLDivElement>) => {
                  const value = (e.target as unknown as HTMLSelectElement).value;
                  field.onChange(value);
                  setValue("activity.n2oEmissionFactorUnit", value);
                }}
              >
                <NativeSelectField
                  placeholder={t("select-unit")}
                  defaultValue={field.value}
                >
                  <option value="units-kilograms">
                    {t("units-kilograms")}
                  </option>
                  <option value="units-tonnes">{t("units-tonnes")}</option>
                </NativeSelectField>
              </NativeSelectRoot>
            )}
          />
        </HStack>
        {activityErrors?.["N2OEmissionFactor"] && (
          <Box display="flex" gap="6px" alignItems="center" mt="6px">
            <Icon as={MdWarning} color="sentiment.negativeDefault" />
            <BodyMedium>
              {activityErrors?.["N2OEmissionFactor"]?.message}
            </BodyMedium>
          </Box>
        )}
        {activityErrors?.["n2oEmissionFactorUnit"] &&
          !activityErrors?.["N2OEmissionFactor"] && (
            <Box display="flex" gap="6px" alignItems="center" mt="6px">
              <Icon as={MdWarning} color="sentiment.negativeDefault" />
              <BodyMedium>
                {activityErrors?.["n2oEmissionFactorUnit"]?.message}
              </BodyMedium>
            </Box>
          )}
      </Field>
      <Field w="full" label={t("emissions-value-ch4")}>
        <HStack>
          <FormattedNumberInput
            testId="ch4-emission-factor"
            t={t}
            control={control}
            miniAddon
            name="activity.CH4EmissionFactor"
            defaultValue="0"
            flex={2}
          />
          <Controller
            rules={{ required: t("option-required") }}
            control={control}
            name="activity.ch4EmissionFactorUnit"
            render={({ field }) => (
              <NativeSelectRoot
                {...field}
                borderRadius="4px"
                borderWidth={
                  activityErrors?.["ch4EmissionFactorUnit"] ? "1px" : 0
                }
                border="inputBox"
                h="42px"
                shadow="1dp"
                borderColor={
                  activityErrors?.["ch4EmissionFactorUnit"]
                    ? "sentiment.negativeDefault"
                    : ""
                }
                background={
                  activityErrors?.["ch4EmissionFactorUnit"]
                    ? "sentiment.negativeOverlay"
                    : ""
                }
                _focus={{
                  borderWidth: "1px",
                  shadow: "none",
                  borderColor: "content.link",
                }}
                bgColor="base.light"
                onChange={(e: React.ChangeEvent<HTMLDivElement>) => {
                  const value = (e.target as unknown as HTMLSelectElement).value;
                  field.onChange(value);
                  setValue("activity.ch4EmissionFactorUnit", value);
                }}
              >
                <NativeSelectField
                  placeholder={t("select-unit")}
                  defaultValue={field.value}
                >
                  <option value="units-kilograms">
                    {t("units-kilograms")}
                  </option>
                  <option value="units-tonnes">{t("units-tonnes")}</option>
                </NativeSelectField>
              </NativeSelectRoot>
            )}
          />
        </HStack>
        {activityErrors?.["CH4EmissionFactor"] && (
          <Box display="flex" gap="6px" alignItems="center" mt="6px">
            <Icon as={MdWarning} color="sentiment.negativeDefault" />
            <BodyMedium>
              {activityErrors?.["CH4EmissionFactor"]?.message}
            </BodyMedium>
          </Box>
        )}
        {activityErrors?.["ch4EmissionFactorUnit"] &&
          !activityErrors?.["CH4EmissionFactor"] && (
            <Box display="flex" gap="6px" alignItems="center" mt="6px">
              <Icon as={MdWarning} color="sentiment.negativeDefault" />
              <BodyMedium>
                {activityErrors?.["ch4EmissionFactorUnit"]?.message}
              </BodyMedium>
            </Box>
          )}
      </Field>
    </Grid>
  );
};
