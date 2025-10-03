import { Box, Grid, HStack, Icon } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { Control, Controller, UseFormSetValue } from "react-hook-form";
import FormattedNumberInput from "@/components/formatted-number-input";
import { Field } from "@/components/ui/field";
import { MdWarning } from "react-icons/md";
import { BodyMedium } from "@/components/package/Texts/Body";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";

interface DirectMeasureSectionProps {
  t: TFunction;
  control: Control<any, any>;
  errors: Record<string, any>;
  isDirectMeasure: boolean;
  setValue: UseFormSetValue<any>;
}

export const DirectMeasureSection = ({
  t,
  control,
  errors,
  isDirectMeasure,
  setValue,
}: DirectMeasureSectionProps) => {
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
                  errors?.activity?.["co2EmissionFactorUnit"] ? "1px" : 0
                }
                border="inputBox"
                h="42px"
                shadow="1dp"
                borderColor={
                  errors?.activity?.["co2EmissionFactorUnit"]
                    ? "sentiment.negativeDefault"
                    : ""
                }
                background={
                  errors?.activity?.["co2EmissionFactorUnit"]
                    ? "sentiment.negativeOverlay"
                    : ""
                }
                _focus={{
                  borderWidth: "1px",
                  shadow: "none",
                  borderColor: "content.link",
                }}
                bgColor="base.light"
                onChange={(e: any) => {
                  field.onChange(e.target.value);
                  setValue("activity.co2EmissionFactorUnit", e.target.value);
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
        {errors?.activity?.["CO2EmissionFactor"] && (
          <Box display="flex" gap="6px" alignItems="center" mt="6px">
            <Icon as={MdWarning} color="sentiment.negativeDefault" />
            <BodyMedium>
              {t(errors?.activity?.["CO2EmissionFactor"]?.message as string)}
            </BodyMedium>
          </Box>
        )}
        {errors?.activity?.["co2EmissionFactorUnit"] &&
          !errors?.activity?.["CO2EmissionFactor"] && (
            <Box display="flex" gap="6px" alignItems="center" mt="6px">
              <Icon as={MdWarning} color="sentiment.negativeDefault" />
              <BodyMedium>
                {errors?.activity?.["co2EmissionFactorUnit"]?.message}
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
                  errors?.activity?.["n2oEmissionFactorUnit"] ? "1px" : 0
                }
                border="inputBox"
                h="42px"
                shadow="1dp"
                borderColor={
                  errors?.activity?.["n2oEmissionFactorUnit"]
                    ? "sentiment.negativeDefault"
                    : ""
                }
                background={
                  errors?.activity?.["n2oEmissionFactorUnit"]
                    ? "sentiment.negativeOverlay"
                    : ""
                }
                _focus={{
                  borderWidth: "1px",
                  shadow: "none",
                  borderColor: "content.link",
                }}
                bgColor="base.light"
                onChange={(e: any) => {
                  field.onChange(e.target.value);
                  setValue("activity.n2oEmissionFactorUnit", e.target.value);
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
        {errors?.activity?.["N2OEmissionFactor"] && (
          <Box display="flex" gap="6px" alignItems="center" mt="6px">
            <Icon as={MdWarning} color="sentiment.negativeDefault" />
            <BodyMedium>
              {errors?.activity?.["N2OEmissionFactor"]?.message}
            </BodyMedium>
          </Box>
        )}
        {errors?.activity?.["n2oEmissionFactorUnit"] &&
          !errors?.activity?.["N2OEmissionFactor"] && (
            <Box display="flex" gap="6px" alignItems="center" mt="6px">
              <Icon as={MdWarning} color="sentiment.negativeDefault" />
              <BodyMedium>
                {errors?.activity?.["n2oEmissionFactorUnit"]?.message}
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
                  errors?.activity?.["ch4EmissionFactorUnit"] ? "1px" : 0
                }
                border="inputBox"
                h="42px"
                shadow="1dp"
                borderColor={
                  errors?.activity?.["ch4EmissionFactorUnit"]
                    ? "sentiment.negativeDefault"
                    : ""
                }
                background={
                  errors?.activity?.["ch4EmissionFactorUnit"]
                    ? "sentiment.negativeOverlay"
                    : ""
                }
                _focus={{
                  borderWidth: "1px",
                  shadow: "none",
                  borderColor: "content.link",
                }}
                bgColor="base.light"
                onChange={(e: any) => {
                  field.onChange(e.target.value);
                  setValue("activity.ch4EmissionFactorUnit", e.target.value);
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
        {errors?.activity?.["CH4EmissionFactor"] && (
          <Box display="flex" gap="6px" alignItems="center" mt="6px">
            <Icon as={MdWarning} color="sentiment.negativeDefault" />
            <BodyMedium>
              {errors?.activity?.["CH4EmissionFactor"]?.message}
            </BodyMedium>
          </Box>
        )}
        {errors?.activity?.["ch4EmissionFactorUnit"] &&
          !errors?.activity?.["CH4EmissionFactor"] && (
            <Box display="flex" gap="6px" alignItems="center" mt="6px">
              <Icon as={MdWarning} color="sentiment.negativeDefault" />
              <BodyMedium>
                {errors?.activity?.["ch4EmissionFactorUnit"]?.message}
              </BodyMedium>
            </Box>
          )}
      </Field>
    </Grid>
  );
};
