import {
  Box,
  Grid,
  Group,
  Heading,
  HStack,
  Icon,
  Input,
  Spinner,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import BuildingTypeSelectInput from "../../building-select-input";
import { TFunction } from "i18next";
import {
  Control,
  Controller,
  useController,
  UseFormGetValues,
  UseFormRegister,
  UseFormSetValue,
  useWatch,
} from "react-hook-form";
import type {
  DirectMeasureData,
  SubcategoryData,
} from "../../../app/[lng]/[inventory]/data/[step]/types";
import { resolve } from "@/util/helpers";
import { ExtraField, Methodology, SuggestedActivity } from "@/util/form-schema";
import { ActivityValue } from "@/models/ActivityValue";
import FormattedNumberInput from "@/components/formatted-number-input";
import PercentageBreakdownInput from "@/components/percentage-breakdown-input";
import { EmissionFactorTypes } from "@/hooks/activity-value-form/use-emission-factors";
import DependentSelectInput from "@/components/dependent-select-input";
import { DialogBody } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Radio, RadioGroup } from "@/components/ui/radio";

import { MdInfoOutline, MdWarning } from "react-icons/md";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";

interface AddActivityModalBodyProps {
  t: TFunction;
  register: UseFormRegister<Inputs>;
  watch: Function;
  control: Control<any, any>;
  submit: () => void;
  fields: ExtraField[];
  hideEmissionFactors?: boolean;
  units?: string[];
  errors: Record<string, any>;
  setError: Function;
  clearErrors: Function;
  emissionsFactorTypes: EmissionFactorTypes[];
  methodology: Methodology;
  selectedActivity?: SuggestedActivity;
  targetActivityValue?: ActivityValue;
  setValue: UseFormSetValue<Inputs>;
  getValues: UseFormGetValues<Inputs>;
  title: string; // Title of the field
  areEmissionFactorsLoading: boolean;
  inventoryId?: string;
}

export type Inputs = {
  activity: {
    activityDataAmount?: number | null | undefined;
    activityDataUnit?: string | null | undefined;
    emissionFactorType?: string;
    emissionFactorReference?: string;
    emissionFactorName?: string;
    CO2EmissionFactor: number;
    N2OEmissionFactor: number;
    CH4EmissionFactor: number;
    dataQuality: string;
    dataComments: string;
    activityType: string;
    fuelType: string;
    co2EmissionFactorUnit: string;
    n2oEmissionFactorUnit: string;
    ch4EmissionFactorUnit: string;
    wasteCompositionType?: string;
  };
  direct: DirectMeasureData;
  subcategoryData: Record<string, SubcategoryData>;
};

const ActivityModalBody = ({
  t,
  register,
  control,
  submit,
  methodology,
  emissionsFactorTypes,
  errors,
  setError,
  clearErrors,
  fields,
  units,
  targetActivityValue,
  selectedActivity,
  title,
  hideEmissionFactors,
  setValue,
  getValues,
  areEmissionFactorsLoading,
  inventoryId,
}: AddActivityModalBodyProps) => {
  const unitValue = useWatch({
    control,
    name: `activity.${title}-unit` as any,
  });

  const emissionsFactorTypeValue = useWatch({
    control,
    name: "activity.emissionFactorType",
  });

  const { field } = useController({
    name: `activity.${methodology.activitySelectionField?.id}`,
    control,
    defaultValue: selectedActivity?.prefills?.[0].value,
  });

  let prefix = "";
  const [isEmissionFactorInputDisabled, setIsEmissionFactorInputDisabled] =
    useState<boolean>(true);

  useEffect(() => {
    setIsEmissionFactorInputDisabled(emissionsFactorTypeValue !== "custom");
  }, [emissionsFactorTypeValue]);

  useEffect(() => {
    if (emissionsFactorTypes.length > 0 && emissionsFactorTypeValue) {
      const emissionFactor = emissionsFactorTypes.find(
        (factor) => factor.id === emissionsFactorTypeValue,
      );
      if (emissionsFactorTypeValue === "custom") {
        setValue(
          "activity.emissionFactorReference",
          t("custom-emission-factor-reference"),
        );
        setValue(
          "activity.emissionFactorName",
          t("custom-emission-factor-name"),
        );
        setIsEmissionFactorInputDisabled(false);
      } else {
        let co2Val =
          (emissionFactor?.gasValuesByGas["CO2"]?.gasValues.length as number) >
          0
            ? emissionFactor?.gasValuesByGas["CO2"].gasValues[0]
                .emissionsPerActivity
            : "";
        let n2oVal =
          (emissionFactor?.gasValuesByGas["N2O"]?.gasValues.length as number) >
          0
            ? emissionFactor?.gasValuesByGas["N2O"].gasValues[0]
                .emissionsPerActivity
            : "";
        let ch4Val =
          (emissionFactor?.gasValuesByGas["CH4"]?.gasValues.length as number) >
          0
            ? emissionFactor?.gasValuesByGas["CH4"].gasValues[0]
                .emissionsPerActivity
            : "";

        setValue("activity.CO2EmissionFactor", co2Val ? co2Val : 0);
        setValue("activity.N2OEmissionFactor", n2oVal ? n2oVal : 0);
        setValue("activity.CH4EmissionFactor", ch4Val ? ch4Val : 0);
        setValue("activity.emissionFactorName", emissionFactor?.name);
        setValue("activity.emissionFactorReference", emissionFactor?.reference);

        setIsEmissionFactorInputDisabled(true);
      }
    }
  }, [emissionsFactorTypes, emissionsFactorTypeValue, setValue, t]);

  const filteredFields = fields.filter((f) => {
    return !(f.id.includes("-source") && f.type === "text");
  });

  const sourceField = fields.find(
    (f) => f.id.includes("-source") && f.type === "text",
  );

  return (
    <DialogBody p={6} px={12}>
      <form onSubmit={submit}>
        {methodology.activitySelectionField && (
          <HStack
            gap={4}
            mb="24px"
            display="flex"
            flexDirection="column"
            className="items-start"
            w="full"
          >
            <Field
              className="w-full"
              label={t(methodology.activitySelectionField.id)}
            >
              <RadioGroup>
                <HStack
                  display="flex"
                  flexDirection="row"
                  className="items-start"
                  w="full"
                >
                  {methodology.activitySelectionField.options?.map((option) => (
                    <Radio key={option} value={option}>
                      {t(option)}
                    </Radio>
                  ))}
                </HStack>
              </RadioGroup>
            </Field>
          </HStack>
        )}
        <HStack
          mb="24px"
          display="flex"
          flexDirection="column"
          className="items-start"
          gap="24px"
        >
          {/* handle select, multi-select types, text  */}
          {filteredFields.map((f, idx) => {
            return (
              <>
                {f.options && (
                  <Field key={idx} className="w-full">
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
                    methodologyName={methodology.id}
                  />
                )}
                {f.type === "text" && (
                  <Field className="w-full" label={t(f.id)}>
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

                    {(errors?.activity?.[f.id] as any) ? (
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
                          {" "}
                          {errors?.activity?.[f.id]?.message}{" "}
                        </Text>
                        {/* use ii8n */}
                      </Box>
                    ) : (
                      ""
                    )}
                  </Field>
                )}
                {f.type === "number" && (
                  <>
                    <Field className="w-full" label={t(f.id)}>
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
                      >
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
                            render={({ field }) => {
                              return (
                                <NativeSelectRoot
                                  variant="subtle"
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
                              );
                            }}
                          />
                        )}
                      </FormattedNumberInput>
                      {(errors?.activity?.[f.id] as any) ? (
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
                            {errors?.activity?.[f.id]?.message}{" "}
                          </Text>
                        </Box>
                      ) : (
                        ""
                      )}
                      {(errors?.activity?.[`${f.id}-unit`] as any) &&
                      !errors?.activity?.[`${f.id}`] ? (
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
                            {" "}
                            {errors?.activity?.[`${f.id}-unit`]?.message}{" "}
                          </Text>
                        </Box>
                      ) : (
                        ""
                      )}
                    </Field>
                  </>
                )}
                {f.dependsOn && (
                  <Field className="w-full" label={t(f.id)}>
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
              </>
            );
          })}
          {!methodology?.id.includes("direct-measure") && title ? (
            <Box
              display="flex"
              justifyContent="space-between"
              gap="16px"
              w="full"
            >
              <Field
                invalid={!!resolve(prefix + "activityDataAmount", errors)}
                label={<Text className="truncate">{t(title)}</Text>}
              >
                <Group>
                  <FormattedNumberInput
                    control={control}
                    name={`activity.${title}`}
                    defaultValue="0"
                    t={t}
                    miniAddon
                  >
                    {(units?.length as number) > 0 && (
                      <Controller
                        rules={{ required: t("option-required") }}
                        defaultValue=""
                        control={control}
                        name={`activity.${title}-unit` as any}
                        render={({ field }) => (
                          <NativeSelectRoot
                            variant="subtle"
                            {...field}
                            onChange={(e: any) => {
                              field.onChange(e.target.value);
                              setValue(
                                `activity.${title}-unit` as any,
                                e.target.value,
                              );
                            }}
                          >
                            <NativeSelectField
                              placeholder={t("select-unit")}
                              value={field.value}
                            >
                              {units?.map((item: string) => (
                                <option key={item} value={item}>
                                  {t(item)}
                                </option>
                              ))}
                            </NativeSelectField>
                          </NativeSelectRoot>
                        )}
                      />
                    )}
                  </FormattedNumberInput>
                </Group>

                {(errors?.activity?.[title] as any) ? (
                  <Box display="flex" gap="6px" alignItems="center" mt="6px">
                    <Icon as={MdWarning} color="sentiment.negativeDefault" />
                    <Text fontSize="body.md">
                      {t("emission-amount-form-error")}
                    </Text>
                  </Box>
                ) : (
                  ""
                )}
                {(errors?.activity?.[`${title}-unit`] as any) &&
                !errors?.activity?.[title] ? (
                  <Box display="flex" gap="6px" alignItems="center" mt="6px">
                    <Icon as={MdWarning} color="sentiment.negativeDefault" />
                    <Text fontSize="body.md">
                      {errors?.activity?.[`${title}-unit`]?.message}{" "}
                    </Text>
                  </Box>
                ) : (
                  ""
                )}
              </Field>
              {!hideEmissionFactors && (
                <Field
                  label={t("emission-factor-type")}
                  invalid={!!resolve(prefix + "emissionFactorType", errors)}
                >
                  <Controller
                    name="activity.emissionFactorType"
                    control={control}
                    render={({ field }) => (
                      <NativeSelectRoot
                        borderRadius="4px"
                        borderWidth={
                          errors?.activity?.emissionFactorType ? "1px" : 0
                        }
                        border="inputBox"
                        h="42px"
                        shadow="1dp"
                        borderColor={
                          errors?.activity?.emissionFactorType
                            ? "sentiment.negativeDefault"
                            : ""
                        }
                        background={
                          errors?.activity?.emissionFactorType
                            ? "sentiment.negativeOverlay"
                            : ""
                        }
                        _focus={{
                          borderWidth: "1px",
                          shadow: "none",
                          borderColor: "content.link",
                        }}
                        bgColor="base.light"
                        {...register("activity.emissionFactorType", {
                          required: t("option-required"),
                        })}
                      >
                        <NativeSelectField
                          value={field.value}
                          placeholder={t("emissions-factor-type-placeholder")}
                          onChange={(e: any) => {
                            field.onChange(e.target.value);
                            setValue(
                              "activity.emissionFactorType",
                              e.target.value,
                            );
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
                        </NativeSelectField>
                      </NativeSelectRoot>
                    )}
                  />

                  {errors.activity?.emissionFactorType ? (
                    <Box display="flex" gap="6px" alignItems="center" mt="6px">
                      <Icon as={MdWarning} color="sentiment.negativeDefault" />
                      <Text fontSize="body.md">
                        {t("emission-factor-form-label")}
                      </Text>
                    </Box>
                  ) : (
                    <Box
                      display="flex"
                      gap="6px"
                      alignItems="center"
                      mt="6px"
                    ></Box>
                  )}
                </Field>
              )}
            </Box>
          ) : null}
        </HStack>
        {methodology?.id.includes("direct-measure") && (
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
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <Text truncate lineClamp={1} w="full" textAlign="center">
                  tCO2
                </Text>
              </FormattedNumberInput>
              {(errors?.activity?.["CO2EmissionFactor"] as any) ? (
                <Box display="flex" gap="6px" alignItems="center" mt="6px">
                  <Icon as={MdWarning} color="sentiment.negativeDefault" />
                  <Text fontSize="body.md">
                    {t("emission-amount-form-error")}
                  </Text>
                </Box>
              ) : (
                ""
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
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <Text truncate lineClamp={1} w="full" textAlign="center">
                  tN2O
                </Text>
              </FormattedNumberInput>
              {(errors?.activity?.["N2OEmissionFactor"] as any) ? (
                <Box display="flex" gap="6px" alignItems="center" mt="6px">
                  <Icon as={MdWarning} color="sentiment.negativeDefault" />
                  <Text fontSize="body.md">
                    {t("emission-amount-form-error")}
                  </Text>
                </Box>
              ) : (
                ""
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
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <Text truncate lineClamp={1} w="full" textAlign="center">
                  tCH4
                </Text>
              </FormattedNumberInput>
              {(errors?.activity?.["CH4EmissionFactor"] as any) ? (
                <Box display="flex" gap="6px" alignItems="center" mt="6px">
                  <Icon as={MdWarning} color="sentiment.negativeDefault" />
                  <Text fontSize="body.md">
                    {t("emission-amount-form-error")}
                  </Text>
                </Box>
              ) : (
                ""
              )}
            </Field>
          </Grid>
        )}
        {!methodology?.id.includes("direct-measure") &&
          !hideEmissionFactors && (
            <>
              <Heading
                size="sm"
                mb={4}
                className="font-normal"
                display="flex"
                alignItems="center"
              >
                <Text
                  fontSize="label.lg"
                  fontStyle="normal"
                  fontWeight="medium"
                  letterSpacing="wide"
                  fontFamily="heading"
                >
                  {t("emissions-factor-values")}
                </Text>
              </Heading>
              <HStack className="items-start" gap={4} mb={5}>
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
                        <Text
                          truncate // Truncate the text with an ellipsis
                          lineClamp={1}
                          w="full"
                          textAlign="center"
                        >
                          {t("kg")}/
                          {methodology.id.includes("energy-consumption") ||
                          methodology.id.includes("electricity-consumption")
                            ? t("kWh")
                            : t("m3")}
                        </Text>
                      )}
                    </FormattedNumberInput>
                  </Field>
                  {(errors?.activity?.["CO2EmissionFactor"] as any) ? (
                    <Box display="flex" gap="6px" alignItems="center" mt="6px">
                      <Icon as={MdWarning} color="sentiment.negativeDefault" />
                      <Text fontSize="body.md">
                        {t("emission-amount-form-error")}
                      </Text>
                    </Box>
                  ) : (
                    <Box
                      display="flex"
                      gap="6px"
                      alignItems="center"
                      mt="6px"
                      h="16px"
                    ></Box>
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
                        {t("kg")}/
                        {methodology.id.includes("energy-consumption") ||
                        methodology.id.includes("electricity-consumption")
                          ? t("kWh")
                          : t("m3")}
                      </Text>
                    )}
                  </FormattedNumberInput>
                  {(errors?.activity?.["N2OEmissionFactor"] as any) ? (
                    <Box display="flex" gap="6px" alignItems="center" mt="6px">
                      <Icon as={MdWarning} color="sentiment.negativeDefault" />
                      <Text fontSize="body.md">
                        {t("emission-amount-form-error")}
                      </Text>
                    </Box>
                  ) : (
                    <Box
                      display="flex"
                      gap="6px"
                      alignItems="center"
                      mt="6px"
                      h="16px"
                    ></Box>
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
                      <Text
                        truncate // Truncate the text with an ellipsis
                        lineClamp={1}
                        w="full"
                        textAlign="center"
                      >
                        {t("kg")}/
                        {methodology.id.includes("energy-consumption") ||
                        methodology.id.includes("electricity-consumption")
                          ? t("kWh")
                          : t("m3")}
                      </Text>
                    )}
                  </FormattedNumberInput>
                  {(errors?.activity?.["CH4EmissionFactor"] as any) ? (
                    <Box display="flex" gap="6px" alignItems="center" mt="6px">
                      <Icon as={MdWarning} color="sentiment.negativeDefault" />
                      <Text fontSize="body.md">
                        {t("emission-amount-form-error")}
                      </Text>
                    </Box>
                  ) : (
                    <Box
                      display="flex"
                      gap="6px"
                      alignItems="center"
                      mt="6px"
                      h="16px"
                    ></Box>
                  )}
                </Field>
              </HStack>
            </>
          )}

        <HStack display="flex" flexDirection="column" gap={4} mb={5}>
          <Field
            invalid={!!resolve(prefix + "dataQuality", errors)}
            label={t("data-quality")}
          >
            <Controller
              name="activity.dataQuality"
              control={control}
              render={({ field }) => (
                <NativeSelectRoot
                  borderWidth={errors?.activity?.dataQuality ? "1px" : 0}
                  border="inputBox"
                  borderRadius="4px"
                  borderColor={
                    errors?.activity?.dataQuality
                      ? "sentiment.negativeDefault"
                      : ""
                  }
                  background={
                    errors?.activity?.dataQuality
                      ? "sentiment.negativeOverlay"
                      : ""
                  }
                  _focus={{
                    borderWidth: "1px",
                    shadow: "none",
                    borderColor: "content.link",
                  }}
                  bgColor="base.light"
                  {...register("activity.dataQuality", {
                    required: t("option-required"),
                  })}
                  h="full"
                  shadow="1dp"
                >
                  <NativeSelectField
                    placeholder={t("data-quality-placeholder")}
                    value={field.value}
                    onChange={(e: any) => {
                      field.onChange(e.target.value);
                      setValue("activity.dataQuality", e.target.value);
                    }}
                  >
                    <option value="high">{t("detailed-activity-data")}</option>
                    <option value="medium">{t("modeled-activity-data")}</option>
                    <option value="low">
                      {t("highly-modeled-uncertain-activity-data")}
                    </option>
                  </NativeSelectField>
                </NativeSelectRoot>
              )}
            />
            {errors.activity?.dataQuality ? (
              <Box display="flex" gap="6px" alignItems="center" mt="6px">
                <Icon as={MdWarning} color="sentiment.negativeDefault" />
                <Text fontSize="body.md">{t("data-quality-form-label")}</Text>
              </Box>
            ) : (
              ""
            )}
          </Field>
          {sourceField && (
            <Field className="w-full" label={t("data-source")}>
              <Input
                type="text"
                borderRadius="4px"
                placeholder={t("data-source-placeholder")}
                h="48px"
                shadow="1dp"
                borderWidth={errors?.activity?.[sourceField.id] ? "1px" : 0}
                border="inputBox"
                borderColor={
                  errors?.activity?.[sourceField.id]
                    ? "sentiment.negativeDefault"
                    : ""
                }
                background={
                  errors?.activity?.[sourceField.id]
                    ? "sentiment.negativeOverlay"
                    : ""
                }
                bgColor="base.light"
                _focus={{
                  borderWidth: "1px",
                  shadow: "none",
                  borderColor: "content.link",
                }}
                {...register(`activity.${sourceField.id}` as any, {
                  required:
                    sourceField.required === false
                      ? false
                      : t("value-required"),
                })}
              />

              {(errors?.activity?.[sourceField.id] as any) ? (
                <Box display="flex" gap="6px" alignItems="center" mt="6px">
                  <Icon as={MdWarning} color="sentiment.negativeDefault" />
                  <Text fontSize="body.md">
                    {" "}
                    {errors?.activity?.[sourceField.id]?.message}{" "}
                  </Text>
                </Box>
              ) : (
                ""
              )}
            </Field>
          )}
          <Field
            invalid={!!resolve(prefix + "dataComments", errors)}
            mb={12}
            label={t("data-comments")}
          >
            <Textarea
              data-testid="source-reference"
              borderWidth={errors?.activity?.dataComments ? "1px" : 0}
              border="inputBox"
              borderRadius="4px"
              shadow="1dp"
              h="96px"
              borderColor={
                errors?.activity?.dataComments
                  ? "sentiment.negativeDefault"
                  : ""
              }
              background={
                errors?.activity?.dataComments
                  ? "sentiment.negativeOverlay"
                  : ""
              }
              _focus={{
                borderWidth: "1px",
                shadow: "none",
                borderColor: "content.link",
              }}
              placeholder={t("data-comments-placeholder")}
              {...register(`activity.dataComments`, {
                required: t("data-comments-required"),
              })}
            />
            {errors.activity?.dataComments ? (
              <Box display="flex" gap="6px" alignItems="center" mt="6px">
                <Icon as={MdWarning} color="sentiment.negativeDefault" />
                <Text fontSize="body.md">
                  {" "}
                  {errors?.activity?.dataComments?.message}{" "}
                </Text>
              </Box>
            ) : (
              ""
            )}
          </Field>
        </HStack>
        <HStack className="items-start" mb={13}>
          <Icon as={MdInfoOutline} mt={1} color="content.link" />
          <Text color="content.tertiary">
            {t("gwp-info-prefix")}{" "}
            <Text as="span" fontWeight="bold">
              {t("gwp-info")}
            </Text>
          </Text>
        </HStack>
      </form>
    </DialogBody>
  );
};

export default ActivityModalBody;
