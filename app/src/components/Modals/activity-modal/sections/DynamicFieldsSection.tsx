import { Grid, GridItem, HStack, Input } from "@chakra-ui/react";
import { TFunction } from "i18next";
import React from "react";
import {
  Control,
  Controller,
  FieldError,
  FieldErrors,
  FieldValues,
  Path,
  UseFormClearErrors,
  UseFormGetValues,
  UseFormRegister,
  UseFormSetError,
  UseFormSetValue,
} from "react-hook-form";
import BuildingTypeSelectInput from "../../../building-select-input";
import { Inputs } from "../activity-modal-body";
import { ExtraField, SuggestedActivity } from "@/util/form-schema";
import FormattedNumberInput from "@/components/formatted-number-input";
import PercentageBreakdownInput from "@/components/percentage-breakdown-input";
import DependentSelectInput from "@/components/dependent-select-input";
import {
  ModalField as Field,
  ModalFieldError,
  ModalSelect,
  modalInputProps,
} from "./ModalField";

interface DynamicFieldsSectionProps {
  t: TFunction;
  register: UseFormRegister<Inputs>;
  control: Control<FieldValues>;
  fields: ExtraField[];
  errors: FieldErrors<FieldValues>;
  setError: UseFormSetError<Inputs>;
  clearErrors: UseFormClearErrors<Inputs>;
  selectedActivity?: SuggestedActivity;
  setValue: UseFormSetValue<Inputs>;
  getValues: UseFormGetValues<Inputs>;
  inventoryId?: string;
  methodologyId: string;
}

// selects (building type, fuel type...) take half of the row, everything else the full row
const isHalfWidth = (f: ExtraField) => !!f.options || !!f.dependsOn;

export const DynamicFieldsSection = ({
  t,
  register,
  control,
  fields,
  errors,
  setError,
  clearErrors,
  selectedActivity,
  setValue,
  getValues,
  inventoryId,
  methodologyId,
}: DynamicFieldsSectionProps) => {
  const filteredFields = fields.filter((f) => {
    return !(f.id.includes("-source") && f.type === "text");
  });

  const activityErrors = errors?.activity as
    Record<string, { message?: string } | undefined> | undefined;

  if (filteredFields.length === 0) {
    return null;
  }

  return (
    <Grid templateColumns="repeat(2, 1fr)" gap={4} mb={5}>
      {filteredFields.map((f, idx) => (
        <GridItem key={idx} colSpan={isHalfWidth(f) ? 1 : 2}>
          {f.options && (
            <Field w="full">
              <BuildingTypeSelectInput
                options={f.options as string[]}
                required={f.required}
                control={control}
                multiselect={f.multiselect}
                title={f.id}
                placeholder={t("select-activity-type")}
                register={register}
                activity={`activity.${f.id}`}
                errors={errors}
                t={t}
                selectedActivity={selectedActivity}
                setValue={setValue}
              />
            </Field>
          )}
          {f.type === "percentage-breakdown" && (
            <PercentageBreakdownInput
              id={f.id}
              label={t(f.id)}
              tooltipInfo={t(f["info-text"] as string)}
              defaultMode={f["default-composition-available"]}
              register={register as unknown as UseFormRegister<FieldValues>}
              getValues={getValues as unknown as UseFormGetValues<FieldValues>}
              control={control}
              setValue={setValue as unknown as UseFormSetValue<FieldValues>}
              setError={setError as unknown as UseFormSetError<FieldValues>}
              clearErrors={
                clearErrors as unknown as UseFormClearErrors<FieldValues>
              }
              breakdownCategories={f.subtypes as string[]}
              error={activityErrors?.[f.id] as FieldError | undefined}
              t={t}
              inventoryId={inventoryId}
              methodologyName={methodologyId}
            />
          )}
          {f.type === "text" && (
            <Field w="full" label={t(f.id)} required={f.required !== false}>
              <Input
                type="text"
                {...modalInputProps(!!activityErrors?.[f.id])}
                {...register(`activity.${f.id}` as Path<Inputs>, {
                  required: f.required === false ? false : t("value-required"),
                })}
              />

              {activityErrors?.[f.id] && (
                <ModalFieldError message={activityErrors?.[f.id]?.message} />
              )}
            </Field>
          )}
          {f.type === "number" && (
            <Field w="full" label={t(f.id)} required={f.required !== false}>
              <HStack>
                <FormattedNumberInput
                  inputHeight="48px"
                  placeholder={t("activity-data-amount-placeholder")}
                  max={f.max!}
                  id={f.id}
                  min={f.min!}
                  control={control}
                  name={`activity.${f.id}`}
                  invalid={!!activityErrors?.[f.id]}
                  t={t}
                  w="full"
                />

                {f.units && (
                  <Controller
                    control={control}
                    name={`activity.${f.id}-unit`}
                    defaultValue=""
                    rules={{
                      required:
                        f.required === false ? false : t("option-required"),
                    }}
                    render={({ field }) => (
                      <ModalSelect
                        placeholder={t("select-unit")}
                        invalid={!!activityErrors?.[`${f.id}-unit`]}
                        name={field.name}
                        value={(field.value as string) ?? ""}
                        onBlur={field.onBlur}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                          field.onChange(e.target.value);
                          setValue(
                            `activity.${f.id}-unit` as Path<Inputs>,
                            e.target.value,
                          );
                        }}
                      >
                        {f.units?.map((item: string) => (
                          <option key={item} value={item}>
                            {t(item)}
                          </option>
                        ))}
                      </ModalSelect>
                    )}
                  />
                )}
              </HStack>
              {activityErrors?.[f.id] && (
                <ModalFieldError message={activityErrors?.[f.id]?.message} />
              )}
              {activityErrors?.[`${f.id}-unit`] && !activityErrors?.[f.id] && (
                <ModalFieldError
                  message={activityErrors?.[`${f.id}-unit`]?.message}
                />
              )}
            </Field>
          )}
          {f.dependsOn && (
            <Field w="full" label={t(f.id)} required={f.required !== false}>
              <DependentSelectInput
                field={f}
                register={register as unknown as UseFormRegister<FieldValues>}
                setValue={
                  setValue as unknown as (name: string, value: unknown) => void
                }
                getValues={
                  getValues as unknown as UseFormGetValues<FieldValues>
                }
                control={control}
                errors={errors}
                setError={setError as unknown as UseFormSetError<FieldValues>}
                t={t}
              />
            </Field>
          )}
        </GridItem>
      ))}
    </Grid>
  );
};
