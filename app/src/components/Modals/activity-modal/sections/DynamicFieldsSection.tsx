import {
  Box,
  HStack,
  Icon,
  Input,
  Text,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import {
  Control,
  Controller,
  UseFormGetValues,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import BuildingTypeSelectInput from "../../../building-select-input";
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
  register: UseFormRegister<any>;
  control: Control<any, any>;
  fields: ExtraField[];
  errors: Record<string, any>;
  setError: Function;
  clearErrors: Function;
  selectedActivity?: SuggestedActivity;
  setValue: UseFormSetValue<any>;
  getValues: UseFormGetValues<any>;
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
              register={register}
              getValues={getValues}
              control={control}
              setValue={setValue}
              setError={setError}
              clearErrors={clearErrors}
              breakdownCategories={f.subtypes as string[]}
              error={errors?.activity?.[f.id]}
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
                borderWidth={errors?.activity?.[f.id] ? "1px" : 0}
                border="inputBox"
                borderColor={
                  errors?.activity?.[f.id]
                    ? "sentiment.negativeDefault"
                    : ""
                }
                background={
                  errors?.activity?.[f.id]
                    ? "sentiment.negativeOverlay"
                    : ""
                }
                bgColor="base.light"
                _focus={{
                  borderWidth: "1px",
                  shadow: "none",
                  borderColor: "content.link",
                }}
                {...register(`activity.${f.id}` as any, {
                  required:
                    f.required === false ? false : t("value-required"),
                })}
              />

              {errors?.activity?.[f.id] && (
                <Box
                  display="flex"
                  gap="6px"
                  alignItems="center"
                  mt="6px"
                >
                  <Icon
                    as={MdWarning}
                    color="sentiment.negativeDefault"
                  />
                  <Text fontSize="body.md">
                    {errors?.activity?.[f.id]?.message}
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
                  setError={setError}
                  clearErrors={clearErrors}
                  min={f.min!}
                  control={control}
                  name={`activity.${f.id}`}
                  t={t}
                  w="full"
                />

                {f.units && (
                  <Controller
                    control={control}
                    name={`activity.${f.id}-unit` as any}
                    defaultValue=""
                    rules={{
                      required:
                        f.required === false
                          ? false
                          : t("option-required"),
                    }}
                    render={({ field }) => (
                      <NativeSelectRoot
                        borderRadius="4px"
                        borderWidth={
                          errors?.activity?.[`${f.id}-unit`]
                            ? "1px"
                            : 0
                        }
                        border="inputBox"
                        h="42px"
                        shadow="1dp"
                        borderColor={
                          errors?.activity?.[`${f.id}-unit`]
                            ? "sentiment.negativeDefault"
                            : ""
                        }
                        background={
                          errors?.activity?.[`${f.id}-unit`]
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
                        onChange={(e: any) => {
                          field.onChange(e.currentTarget.value);
                          setValue(
                            `activity.${f.id}-unit` as any,
                            e.target.value,
                          );
                        }}
                      >
                        <NativeSelectField
                          value={field.value}
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
              {errors?.activity?.[f.id] && (
                <Box
                  display="flex"
                  gap="6px"
                  alignItems="center"
                  mt="6px"
                >
                  <Icon
                    as={MdWarning}
                    color="sentiment.negativeDefault"
                  />
                  <Text fontSize="body.md">
                    {errors?.activity?.[f.id]?.message}
                  </Text>
                </Box>
              )}
              {errors?.activity?.[`${f.id}-unit`] && !errors?.activity?.[f.id] && (
                <Box
                  display="flex"
                  gap="6px"
                  alignItems="center"
                  mt="6px"
                >
                  <Icon
                    as={MdWarning}
                    color="sentiment.negativeDefault"
                  />
                  <Text fontSize="body.md">
                    {errors?.activity?.[`${f.id}-unit`]?.message}
                  </Text>
                </Box>
              )}
            </Field>
          )}
          {f.dependsOn && (
            <Field w="full" label={t(f.id)}>
              <DependentSelectInput
                field={f}
                register={register}
                setValue={setValue}
                getValues={getValues}
                control={control}
                errors={errors}
                setError={setError}
                t={t}
              />
            </Field>
          )}
        </Box>
      ))}
    </HStack>
  );
};