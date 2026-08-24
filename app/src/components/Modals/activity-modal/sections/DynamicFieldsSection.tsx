import { Box, HStack, Icon, Input, Text } from "@chakra-ui/react";
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
import { Field } from "@/components/ui/field";
import { MdWarning } from "react-icons/md";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";

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
    | Record<string, { message?: string } | undefined>
    | undefined;

  if (filteredFields.length === 0) {
    return null;
  }

  return (
    <HStack
      mb="24px"
      display="flex"
      flexDirection="column"
      alignItems="flex-start"
      gap="24px"
    >
      {filteredFields.map((f, idx) => (
        <Box key={idx}>
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
            <Field w="full" label={t(f.id)}>
              <Input
                type="text"
                borderRadius="4px"
                h="48px"
                shadow="1dp"
                borderWidth={activityErrors?.[f.id] ? "1px" : 0}
                border="inputBox"
                borderColor={
                  activityErrors?.[f.id] ? "sentiment.negativeDefault" : ""
                }
                background={
                  activityErrors?.[f.id] ? "sentiment.negativeOverlay" : ""
                }
                bgColor="base.light"
                _focus={{
                  borderWidth: "1px",
                  shadow: "none",
                  borderColor: "content.link",
                }}
                {...register(`activity.${f.id}` as Path<Inputs>, {
                  required: f.required === false ? false : t("value-required"),
                })}
              />

              {activityErrors?.[f.id] && (
                <Box display="flex" gap="6px" alignItems="center" mt="6px">
                  <Icon as={MdWarning} color="sentiment.negativeDefault" />
                  <Text fontSize="body.md">
                    {activityErrors?.[f.id]?.message}
                  </Text>
                </Box>
              )}
            </Field>
          )}
          {f.type === "number" && (
            <Field w="full" label={t(f.id)}>
              <HStack>
                <FormattedNumberInput
                  placeholder={t("activity-data-amount-placeholder")}
                  max={f.max!}
                  id={f.id}
                  min={f.min!}
                  control={control}
                  name={`activity.${f.id}`}
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
                      <NativeSelectRoot
                        borderRadius="4px"
                        borderWidth={
                          activityErrors?.[`${f.id}-unit`] ? "1px" : 0
                        }
                        border="inputBox"
                        h="42px"
                        shadow="1dp"
                        borderColor={
                          activityErrors?.[`${f.id}-unit`]
                            ? "sentiment.negativeDefault"
                            : ""
                        }
                        background={
                          activityErrors?.[`${f.id}-unit`]
                            ? "sentiment.negativeOverlay"
                            : ""
                        }
                        _focus={{
                          borderWidth: "1px",
                          shadow: "none",
                          borderColor: "content.link",
                        }}
                        bgColor="base.light"
                        {...field}
                        onChange={(e: React.ChangeEvent<HTMLDivElement>) => {
                          const value = (
                            e.target as unknown as HTMLSelectElement
                          ).value;
                          field.onChange(value);
                          setValue(
                            `activity.${f.id}-unit` as Path<Inputs>,
                            value,
                          );
                        }}
                      >
                        <NativeSelectField
                          value={field.value as string}
                          placeholder={t("select-unit")}
                        >
                          {f.units?.map((item: string) => (
                            <option key={item} value={item}>
                              {t(item)}
                            </option>
                          ))}
                        </NativeSelectField>
                      </NativeSelectRoot>
                    )}
                  />
                )}
              </HStack>
              {activityErrors?.[f.id] && (
                <Box display="flex" gap="6px" alignItems="center" mt="6px">
                  <Icon as={MdWarning} color="sentiment.negativeDefault" />
                  <Text fontSize="body.md">
                    {activityErrors?.[f.id]?.message}
                  </Text>
                </Box>
              )}
              {activityErrors?.[`${f.id}-unit`] &&
                !activityErrors?.[f.id] && (
                  <Box display="flex" gap="6px" alignItems="center" mt="6px">
                    <Icon as={MdWarning} color="sentiment.negativeDefault" />
                    <Text fontSize="body.md">
                      {activityErrors?.[`${f.id}-unit`]?.message}
                    </Text>
                  </Box>
                )}
            </Field>
          )}
          {f.dependsOn && (
            <Field w="full" label={t(f.id)}>
              <DependentSelectInput
                field={f}
                register={register as unknown as UseFormRegister<FieldValues>}
                setValue={
                  setValue as unknown as (
                    name: string,
                    value: unknown,
                  ) => void
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
        </Box>
      ))}
    </HStack>
  );
};
