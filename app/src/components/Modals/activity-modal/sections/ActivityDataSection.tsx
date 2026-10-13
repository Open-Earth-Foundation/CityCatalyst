import { Box, HStack, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import React from "react";
import {
  Control,
  Controller,
  FieldErrors,
  FieldValues,
  Path,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import FormattedNumberInput from "@/components/formatted-number-input";
import { EmissionFactorTypes } from "@/hooks/activity-value-form/use-emission-factors";
import { Inputs } from "../activity-modal-body";
import { ModalField, ModalFieldError, ModalSelect } from "./ModalField";

interface ActivityDataSectionProps {
  t: TFunction;
  register: UseFormRegister<Inputs>;
  control: Control<FieldValues>;
  errors: FieldErrors<FieldValues>;
  setValue: UseFormSetValue<Inputs>;
  title: string;
  units?: string[];
  hideEmissionFactors?: boolean;
  emissionsFactorTypes: EmissionFactorTypes[];
  isDirectMeasure: boolean;
}

export const ActivityDataSection = ({
  t,
  register,
  control,
  errors,
  setValue,
  title,
  units,
  hideEmissionFactors,
  emissionsFactorTypes,
  isDirectMeasure,
}: ActivityDataSectionProps) => {
  const activityErrors = errors?.activity as
    Record<string, { message?: string } | undefined> | undefined;

  if (isDirectMeasure || !title) {
    return null;
  }

  return (
    <Box
      display="flex"
      justifyContent="space-between"
      alignItems="flex-start"
      gap="16px"
      w="full"
      mb={5}
    >
      <ModalField
        invalid={!!activityErrors?.[title]}
        label={<Text truncate>{t(title)}</Text>}
        required
        flex="2"
      >
        <HStack w="full">
          <FormattedNumberInput
            inputHeight="48px"
            control={control}
            name={`activity.${title}`}
            invalid={!!activityErrors?.[title]}
            defaultValue="0"
            t={t}
            miniAddon
            w="full"
            flex={2}
          />
          {(units?.length as number) > 0 && (
            <Controller
              rules={{ required: t("option-required") }}
              defaultValue=""
              control={control}
              name={`activity.${title}-unit`}
              render={({ field }) => (
                <ModalSelect
                  aria-label={t("select-unit")}
                  placeholder={t("select-unit")}
                  invalid={!!activityErrors?.[`${title}-unit`]}
                  name={field.name}
                  value={field.value ?? ""}
                  onBlur={field.onBlur}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    field.onChange(e.target.value);
                    setValue(
                      `activity.${title}-unit` as Path<Inputs>,
                      e.target.value,
                    );
                  }}
                >
                  {units?.map((item: string) => (
                    <option key={item} value={item}>
                      {t(item)}
                    </option>
                  ))}
                </ModalSelect>
              )}
            />
          )}
        </HStack>

        {activityErrors?.[title] && (
          <ModalFieldError
            message={t(activityErrors[title]?.message as string)}
          />
        )}
        {activityErrors?.[`${title}-unit`] && !activityErrors?.[title] && (
          <ModalFieldError message={activityErrors[`${title}-unit`]?.message} />
        )}
      </ModalField>

      {!hideEmissionFactors && (
        <ModalField
          label={t("emission-factor-type")}
          required
          invalid={!!activityErrors?.emissionFactorType}
          maxWidth="250px"
          flex="1"
          truncateLabel
        >
          <Controller
            name="activity.emissionFactorType"
            control={control}
            render={({ field }) => (
              <ModalSelect
                aria-label={t("select-emission-factor-type")}
                placeholder={t("emissions-factor-type-placeholder")}
                invalid={!!activityErrors?.emissionFactorType}
                {...register("activity.emissionFactorType", {
                  required: t("option-required"),
                })}
                value={field.value ?? ""}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  field.onChange(e.target.value);
                  setValue("activity.emissionFactorType", e.target.value);
                }}
              >
                {emissionsFactorTypes.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {t(name)}
                  </option>
                ))}
                <option key="custom" value="custom">
                  {t("add-custom")}
                </option>
              </ModalSelect>
            )}
          />
          {activityErrors?.emissionFactorType && (
            <ModalFieldError message={t("emission-factor-form-label")} />
          )}
        </ModalField>
      )}
    </Box>
  );
};
