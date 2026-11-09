import { Grid, HStack } from "@chakra-ui/react";
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
import { Inputs } from "../activity-modal-body";
import { ModalField, ModalFieldError, ModalSelect } from "./ModalField";

interface DirectMeasureSectionProps {
  t: TFunction;
  control: Control<FieldValues>;
  errors: FieldErrors<FieldValues>;
  isDirectMeasure: boolean;
  setValue: UseFormSetValue<Inputs>;
}

const GASES = [
  { gas: "CO2", label: "emissions-value-co2", testId: "co2-emission-factor" },
  { gas: "N2O", label: "emissions-value-n2o", testId: "n2o-emission-factor" },
  { gas: "CH4", label: "emissions-value-ch4", testId: "ch4-emission-factor" },
] as const;

export const DirectMeasureSection = ({
  t,
  control,
  errors,
  isDirectMeasure,
}: DirectMeasureSectionProps) => {
  const activityErrors = errors?.activity as
    Record<string, { message?: string } | undefined> | undefined;

  if (!isDirectMeasure) {
    return null;
  }

  return (
    <Grid templateColumns="repeat(2, 1fr)" gap={4} mb={5}>
      {GASES.map(({ gas, label, testId }) => {
        const amountKey = `${gas}EmissionFactor`;
        const unitKey = `${gas.toLowerCase()}EmissionFactorUnit`;
        return (
          <ModalField key={gas} w="full" label={t(label)} required>
            <HStack>
              <FormattedNumberInput
                inputHeight="48px"
                testId={testId}
                t={t}
                control={control}
                miniAddon
                name={`activity.${amountKey}`}
                placeholder={t("input-emissions")}
                invalid={!!activityErrors?.[amountKey]}
                rules={{ required: t("emissions-value-required") }}
                flex={2}
              />
              <Controller
                rules={{ required: t("unit-required") }}
                control={control}
                name={`activity.${unitKey}`}
                render={({ field }) => (
                  <ModalSelect
                    placeholder={t("select-unit")}
                    invalid={!!activityErrors?.[unitKey]}
                    name={field.name}
                    value={field.value ?? ""}
                    onBlur={field.onBlur}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      field.onChange(e.target.value)
                    }
                  >
                    <option value="units-kilograms">
                      {t("units-kilograms")}
                    </option>
                    <option value="units-tonnes">{t("units-tonnes")}</option>
                  </ModalSelect>
                )}
              />
            </HStack>
            {(activityErrors?.[amountKey] || activityErrors?.[unitKey]) && (
              <ModalFieldError
                message={t(
                  activityErrors?.[amountKey] && activityErrors?.[unitKey]
                    ? "emissions-value-and-unit-required"
                    : activityErrors?.[amountKey]
                      ? "emissions-value-required"
                      : "unit-required",
                )}
              />
            )}
          </ModalField>
        );
      })}
    </Grid>
  );
};
