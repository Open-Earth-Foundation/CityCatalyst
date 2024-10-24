import {
  Box,
  FormControl,
  FormLabel,
  Grid,
  Heading,
  HStack,
  Input,
  InputGroup,
  ModalBody,
  Select,
  Text,
  Textarea,
  useRadioGroup,
} from "@chakra-ui/react";
import { useState } from "react";
import BuildingTypeSelectInput from "../../building-select-input";
import { InfoOutlineIcon, WarningIcon } from "@chakra-ui/icons";
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
import { Methodology, SuggestedActivity } from "@/util/form-schema";
import { ActivityValue } from "@/models/ActivityValue";
import FormattedNumberInput from "@/components/formatted-number-input";
import PercentageBreakdownInput from "@/components/percentage-breakdown-input";
import { RadioButton } from "@/components/radio-button";

export type EmissionFactorTypes = {
  id: string;
  name: string;
  gasValues: { gas: string; emissionsPerActivity: number }[];
}[];

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
  emissionsFactorTypes: EmissionFactorTypes;
  methodology: Methodology;
  selectedActivity?: SuggestedActivity;
  targetActivityValue?: ActivityValue;
  setValue: UseFormSetValue<Inputs>;
  getValues: UseFormGetValues<Inputs>;
  title: string; // Title of the field
}

export type Inputs = {
  activity: {
    activityDataAmount?: number | null | undefined;
    activityDataUnit?: string | null | undefined;
    emissionFactorType?: string;
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
  };
  direct: DirectMeasureData;
  subcategoryData: Record<string, SubcategoryData>;
};

export type ExtraField = {
  id: string;
  type?: string; // Specifies the type, e.g., 'text', 'number'
  options?: string[]; // Array of options for selection
  exclusive?: string; // An option that excludes others
  multiselect?: boolean; // Whether multiple selections are allowed
  units?: string[]; // Specifies units, applicable when type is 'number'
  required?: boolean; // Whether the field is required
  subtypes?: string[];
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
}: AddActivityModalBodyProps) => {
  //

  const unitValue = useWatch({
    control,
    name: `activity.${title}Unit` as any,
  });

  const { field } = useController({
    name: `activity.${methodology.activitySelectionField?.id}`,
    control,
    defaultValue: selectedActivity?.prefills?.[0].value,
  });
  const { getRootProps, getRadioProps, value } = useRadioGroup(field);

  let prefix = "";
  const [isEmissionFactorInputDisabled, setIsEmissionFactorInputDisabled] =
    useState<boolean>(
      !(targetActivityValue?.metadata?.emissionFactorType === "custom"),
    );

  // Adjust function for countries with national emission factors i.e. US
  const onEmissionFactorTypeChange = (e: any) => {
    // somehow extract the gas and the emissions perActivity for each gas
    const emissionFactor = emissionsFactorTypes.find(
      (factor) => factor.id === e.target.value,
    );
    const emissionFactorType = e.target.value;
    if (emissionFactorType === "custom") {
      setIsEmissionFactorInputDisabled(false);
    } else {
      let co2Val = emissionFactor?.gasValues.find(
        (g) => g.gas === "CO2",
      )?.emissionsPerActivity;
      let n2oVal = emissionFactor?.gasValues.find(
        (g) => g.gas === "N2O",
      )?.emissionsPerActivity;
      let ch4Val = emissionFactor?.gasValues.find(
        (g) => g.gas === "CH4",
      )?.emissionsPerActivity;

      setValue("activity.CO2EmissionFactor", co2Val ? co2Val : null);
      setValue("activity.N2OEmissionFactor", n2oVal ? n2oVal : null);
      setValue("activity.CH4EmissionFactor", ch4Val ? ch4Val : null);
      setIsEmissionFactorInputDisabled(true);
    }
  };

  const filteredFields = fields.filter((f) => {
    return !(f.id.includes("-source") && f.type === "text");
  });

  const sourceField = fields.find(
    (f) => f.id.includes("-source") && f.type === "text",
  );

  return (
    <ModalBody p={6} px={12}>
      <form onSubmit={submit}>
        {methodology.activitySelectionField && (
          <HStack
            spacing={4}
            mb="24px"
            display="flex"
            flexDirection="column"
            className="items-start"
            gap="24px"
          >
            <FormControl className="w-full">
              <FormLabel>{t(methodology.activitySelectionField.id)}</FormLabel>
              <HStack
                display="flex"
                flexDirection="row"
                className="items-start"
              >
                {methodology.activitySelectionField.options?.map((option) => (
                  <RadioButton
                    key={option}
                    {...getRadioProps({ value: option })}
                  >
                    {t(option)}
                  </RadioButton>
                ))}
              </HStack>
            </FormControl>
          </HStack>
        )}
        <HStack
          spacing={4}
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
                  <FormControl key={idx} className="w-full">
                    <BuildingTypeSelectInput
                      options={f.options}
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
                  </FormControl>
                )}
                {f.type === "percentage-breakdown" && (
                  <PercentageBreakdownInput
                    id={f.id}
                    label={t(f.id)}
                    register={register}
                    getValues={getValues}
                    control={control}
                    setValue={setValue}
                    setError={setError}
                    clearErrors={clearErrors}
                    breakdownCategories={f.subtypes as string[]}
                    error={errors?.activity?.[f.id]}
                    t={t}
                  />
                )}
                {f.type === "text" && (
                  <FormControl className="w-full">
                    <FormLabel className="truncate">{t(f.id)}</FormLabel>
                    <InputGroup>
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
                    </InputGroup>
                    {(errors?.activity?.[f.id] as any) ? (
                      <Box
                        display="flex"
                        gap="6px"
                        alignItems="center"
                        mt="6px"
                      >
                        <WarningIcon color="sentiment.negativeDefault" />
                        <Text fontSize="body.md">
                          {" "}
                          {errors?.activity?.[f.id]?.message}{" "}
                        </Text>
                        {/* use ii8n */}
                      </Box>
                    ) : (
                      ""
                    )}
                  </FormControl>
                )}
                {f.type === "number" && (
                  <>
                    <FormControl className="w-full">
                      <FormLabel className="truncate">{f.id}</FormLabel>
                      <FormattedNumberInput
                        placeholder={t("activity-data-amount-placeholder")}
                        control={control}
                        name={`activity.${f.id}`}
                        w="full"
                      >
                        {f.units && (
                          <Select
                            variant="unstyled"
                            {...register(`activity.${f.id}-unit` as any, {
                              required:
                                f.required === false
                                  ? false
                                  : t("value-required"),
                            })}
                          >
                            {f.units?.map((item: string) => (
                              <option key={item} value={item}>
                                {t(item)}
                              </option>
                            ))}
                          </Select>
                        )}
                      </FormattedNumberInput>
                      {(errors?.[`activity.${f.id}`] as any) ? (
                        <Box
                          display="flex"
                          gap="6px"
                          alignItems="center"
                          mt="6px"
                        >
                          <WarningIcon color="sentiment.negativeDefault" />
                          <Text fontSize="body.md">
                            {errors?.activity?.[f.id]?.message}{" "}
                          </Text>
                        </Box>
                      ) : (
                        ""
                      )}
                    </FormControl>
                  </>
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
              <FormControl
                isInvalid={!!resolve(prefix + "activityDataAmount", errors)}
              >
                <FormLabel className="truncate">{t(title)}</FormLabel>
                <InputGroup>
                  <FormattedNumberInput
                    control={control}
                    name={`activity.${title}`}
                    defaultValue={0}
                    miniAddon
                  >
                    {(units?.length as number) > 0 && (
                      <Controller
                        rules={{ required: t("option-required") }}
                        defaultValue=""
                        control={control}
                        name={`activity.${title}-unit` as any}
                        render={({ field }) => (
                          <Select
                            placeholder={t("select-unit")}
                            variant="unstyled"
                            {...field}
                            required
                            onChange={(e) => field.onChange(e.target.value)}
                          >
                            {units?.map((item: string) => (
                              <option key={item} value={item}>
                                {t(item)}
                              </option>
                            ))}
                          </Select>
                        )}
                      />
                    )}
                  </FormattedNumberInput>
                </InputGroup>

                {(errors?.activity?.[title] as any) ? (
                  <Box display="flex" gap="6px" alignItems="center" mt="6px">
                    <WarningIcon color="sentiment.negativeDefault" />
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
                    <WarningIcon color="sentiment.negativeDefault" />
                    <Text fontSize="body.md">
                      {errors?.activity?.[`${title}-unit`]?.message}{" "}
                    </Text>
                  </Box>
                ) : (
                  ""
                )}
              </FormControl>
              {!hideEmissionFactors && (
                <FormControl>
                  <FormLabel>{t("emission-factor-type")}</FormLabel>
                  <Select
                    borderRadius="4px"
                    borderWidth={
                      errors?.activity?.emissionFactorType ? "1px" : 0
                    }
                    border="inputBox"
                    h="48px"
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
                    {...register("activity.emissionFactorType", {
                      required: t("value-required"),
                    })}
                    bgColor="base.light"
                    placeholder={t("emissions-factor-type-placeholder")}
                    onChange={(e: any) => {
                      clearErrors("activity.emissionFactorType");
                      onEmissionFactorTypeChange(e);
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
                  </Select>
                  {errors.activity?.emissionFactorType ? (
                    <Box display="flex" gap="6px" alignItems="center" mt="6px">
                      <WarningIcon color="sentiment.negativeDefault" />
                      <Text fontSize="body.md">
                        {t("emission-factor-form-label")}
                      </Text>
                    </Box>
                  ) : (
                    ""
                  )}
                </FormControl>
              )}
            </Box>
          ) : null}
        </HStack>
        {methodology?.id.includes("direct-measure") && (
          <Grid templateColumns="repeat(2, 1fr)" gap={4} mb={5}>
            <FormControl w="full">
              <FormLabel color="content.secondary">
                {t("emissions-value-co2")}
              </FormLabel>
              <FormattedNumberInput
                testId="co2-emission-factor"
                control={control}
                miniAddon
                name={`activity.CO2EmissionFactor`}
                defaultValue={0}
              >
                <Text
                  isTruncated // Truncate the text with an ellipsis
                  noOfLines={1}
                  w="full"
                  textAlign="center"
                >
                  tCO2
                </Text>
              </FormattedNumberInput>
            </FormControl>
            <FormControl w="full">
              <FormLabel color="content.secondary">
                {t("emissions-value-n2o")}
              </FormLabel>
              <FormattedNumberInput
                testId="n2o-emission-factor"
                control={control}
                miniAddon
                name={`activity.N2OEmissionFactor`}
                defaultValue={0}
              >
                <Text
                  isTruncated // Truncate the text with an ellipsis
                  noOfLines={1}
                  w="full"
                  textAlign="center"
                >
                  tN2O
                </Text>
              </FormattedNumberInput>
            </FormControl>
            <FormControl w="full">
              <FormLabel color="content.secondary">
                {t("emissions-value-ch4")}
              </FormLabel>
              <FormattedNumberInput
                testId="ch4-emission-factor"
                control={control}
                miniAddon
                name={`activity.CH4EmissionFactor`}
                defaultValue={0}
              >
                <Text
                  isTruncated // Truncate the text with an ellipsis
                  noOfLines={1}
                  w="full"
                  textAlign="center"
                >
                  tCH4
                </Text>
              </FormattedNumberInput>
            </FormControl>
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
                <FormLabel
                  variant="label"
                  fontSize="label.lg"
                  fontStyle="normal"
                  fontWeight="medium"
                  letterSpacing="wide"
                  fontFamily="heading"
                >
                  {t("emissions-factor-values")}
                </FormLabel>
              </Heading>
              <HStack spacing={4} mb={5}>
                <FormControl>
                  <FormControl>
                    <FormLabel color="content.tertiary">
                      {t("co2-emission-factor")}
                    </FormLabel>
                    <FormattedNumberInput
                      miniAddon
                      control={control}
                      name={`activity.CO2EmissionFactor`}
                      defaultValue={0}
                      isDisabled={isEmissionFactorInputDisabled}
                    >
                      <Text
                        isTruncated // Truncate the text with an ellipsis
                        noOfLines={1}
                        w="full"
                        textAlign="center"
                      >
                        CO2/{t(unitValue)}
                      </Text>
                    </FormattedNumberInput>
                  </FormControl>
                </FormControl>
                <FormControl>
                  <FormLabel color="content.tertiary">
                    {t("n2o-emission-factor")}
                  </FormLabel>
                  <FormattedNumberInput
                    miniAddon
                    control={control}
                    name={`activity.N2OEmissionFactor`}
                    defaultValue={0}
                    isDisabled={isEmissionFactorInputDisabled}
                  >
                    <Text
                      isTruncated // Truncate the text with an ellipsis
                      noOfLines={1}
                      w="full"
                      textAlign="center"
                    >
                      N20/{t(unitValue)}
                    </Text>
                  </FormattedNumberInput>
                </FormControl>
                <FormControl>
                  <FormLabel color="content.tertiary">
                    {t("ch4-emission-factor")}
                  </FormLabel>
                  <FormattedNumberInput
                    control={control}
                    miniAddon
                    name={`activity.CH4EmissionFactor`}
                    defaultValue={0}
                    isDisabled={isEmissionFactorInputDisabled}
                  >
                    <Text
                      isTruncated // Truncate the text with an ellipsis
                      noOfLines={1}
                      w="full"
                      textAlign="center"
                    >
                      CH4/{t(unitValue)}
                    </Text>
                  </FormattedNumberInput>
                </FormControl>
              </HStack>{" "}
            </>
          )}

        <HStack display="flex" flexDirection="column" spacing={4} mb={5}>
          <FormControl isInvalid={!!resolve(prefix + "dataQuality", errors)}>
            <FormLabel>{t("data-quality")}</FormLabel>
            <Select
              borderWidth={errors?.activity?.dataQuality ? "1px" : 0}
              border="inputBox"
              borderRadius="4px"
              borderColor={
                errors?.activity?.dataQuality ? "sentiment.negativeDefault" : ""
              }
              background={
                errors?.activity?.dataQuality ? "sentiment.negativeOverlay" : ""
              }
              _focus={{
                borderWidth: "1px",
                shadow: "none",
                borderColor: "content.link",
              }}
              bgColor="base.light"
              placeholder={t("data-quality-placeholder")}
              {...register("activity.dataQuality", {
                required: t("option-required"),
              })}
              h="48px"
              shadow="1dp"
            >
              <option value="high">{t("detailed-activity-data")}</option>
              <option value="medium">{t("modeled-activity-data")}</option>
              <option value="low">
                {t("highly-modeled-uncertain-activity-data")}
              </option>
            </Select>
            {errors.activity?.dataQuality ? (
              <Box display="flex" gap="6px" alignItems="center" mt="6px">
                <WarningIcon color="sentiment.negativeDefault" />
                <Text fontSize="body.md">{t("data-quality-form-label")}</Text>
              </Box>
            ) : (
              ""
            )}
          </FormControl>
          {sourceField && (
            <FormControl className="w-full">
              <FormLabel className="truncate">{t("data-source")}</FormLabel>
              <InputGroup>
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
              </InputGroup>
              {(errors?.activity?.[sourceField.id] as any) ? (
                <Box display="flex" gap="6px" alignItems="center" mt="6px">
                  <WarningIcon color="sentiment.negativeDefault" />
                  <Text fontSize="body.md">
                    {" "}
                    {errors?.activity?.[sourceField.id]?.message}{" "}
                  </Text>
                </Box>
              ) : (
                ""
              )}
            </FormControl>
          )}
          <FormControl
            isInvalid={!!resolve(prefix + "dataComments", errors)}
            mb={12}
          >
            <FormLabel>{t("data-comments")}</FormLabel>
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
                <WarningIcon color="sentiment.negativeDefault" />
                <Text fontSize="body.md">
                  {" "}
                  {errors?.activity?.dataComments?.message}{" "}
                </Text>
              </Box>
            ) : (
              ""
            )}
          </FormControl>
        </HStack>

        <HStack className="items-start" mb={13}>
          <InfoOutlineIcon mt={1} color="content.link" />
          <Text color="content.tertiary">
            {t("gwp-info-prefix")}{" "}
            <Text as="span" fontWeight="bold">
              {t("gwp-info")}
            </Text>
          </Text>
        </HStack>
      </form>
    </ModalBody>
  );
};

export default ActivityModalBody;
