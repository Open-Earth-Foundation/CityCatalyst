import {
  Box,
  FormControl,
  FormLabel,
  Grid,
  Heading,
  HStack,
  Input,
  InputGroup,
  InputRightAddon,
  ModalBody,
  NumberInput,
  NumberInputField,
  Select,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useState } from "react";
import BuildingTypeSelectInput from "../../building-select-input";
import { InfoOutlineIcon, WarningIcon } from "@chakra-ui/icons";
import { TFunction } from "i18next";
import {
  Control,
  Controller,
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
import { SuggestedActivity } from "@/util/form-schema";
import { ActivityValue } from "@/models/ActivityValue";

export type EmissionFactorTypes = {
  id: string;
  name: string;
}[];

interface AddActivityModalBodyProps {
  t: TFunction;
  register: UseFormRegister<Inputs>;
  control: Control<Inputs, any>;
  submit: () => void;
  fields: ExtraField[];
  units: string[];
  errors: Record<string, any>;
  emissionsFactorTypes: EmissionFactorTypes;
  methodology: any;
  selectedActivity?: SuggestedActivity;
  targetActivityValue?: ActivityValue;
  setValue: UseFormSetValue<Inputs>;
  getValues: UseFormGetValues<Inputs>;
  title?: string; // Title of the field
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
};

const ActivityModalBody = ({
  t,
  register,
  control,
  submit,
  methodology,
  emissionsFactorTypes,
  errors,
  fields,
  units,
  targetActivityValue,
  selectedActivity,
  title,
  setValue,
  getValues,
}: AddActivityModalBodyProps) => {
  const unitValue = useWatch({
    control,
    name: `activity.${title}Unit` as any,
  });

  let prefix = "";
  const [isEmissionFactorInputDisabled, setIsEmissionFactorInputDisabled] =
    useState<boolean>(
      !(targetActivityValue?.metadata?.emissionFactorType === "custom"),
    );

  // Adjust function for countries with national emission factors i.e US
  const onEmissionFactorTypeChange = (e: any) => {
    const emissionFactorType = e.target.value;
    if (emissionFactorType === "custom") {
      setIsEmissionFactorInputDisabled(false);
    } else {
      setValue("activity.CO2EmissionFactor", 0);
      setValue("activity.N2OEmissionFactor", 0);
      setValue("activity.CH4EmissionFactor", 0);
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
        <HStack
          spacing={4}
          mb="24px"
          display="flex"
          flexDirection="column"
          className="items-start"
          gap="24px"
        >
          {/* handle select, multi-select types, text  */}
          {filteredFields.map((f) => {
            return (
              <>
                {f.options && (
                  <FormControl className="w-full">
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
                      <InputGroup>
                        <NumberInput defaultValue={0} w="full">
                          <NumberInputField
                            type="number"
                            borderRadius="4px"
                            placeholder={t("activity-data-amount-placeholder")}
                            borderRightRadius={f.units ? 0 : "4px"}
                            h="48px"
                            shadow="1dp"
                            borderWidth={
                              errors?.[`activity.${f.id}`] ? "1px" : 0
                            }
                            border="inputBox"
                            borderColor={
                              errors?.activity?.totalFuelConsumption
                                ? "sentiment.negativeDefault"
                                : ""
                            }
                            background={
                              errors?.activity?.totalFuelConsumption
                                ? "sentiment.negativeOverlay"
                                : ""
                            }
                            bgColor="base.light"
                            _focus={{
                              borderWidth: "1px",
                              shadow: "none",
                              borderColor: "content.link",
                            }}
                            {...register(`activity.${f.id}` as any)}
                          />
                        </NumberInput>
                        {f.units && (
                          <InputRightAddon
                            className="border-l-2"
                            pl={4}
                            pr={0}
                            bgColor="base.light"
                            h="48px"
                            shadow="1dp"
                          >
                            <Select
                              variant="unstyled"
                              {...register(`activity.${f.id}Unit` as any, {
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
                          </InputRightAddon>
                        )}
                      </InputGroup>
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
                  <NumberInput defaultValue={0} w="full">
                    <NumberInputField
                      borderRadius="4px"
                      placeholder={t("activity-data-amount-placeholder")}
                      borderRightRadius={0}
                      h="48px"
                      shadow="1dp"
                      borderWidth={
                        (errors?.activity?.[title] as any) ? "1px" : 0
                      }
                      border="inputBox"
                      borderColor={
                        (errors?.activity?.[title] as any)
                          ? "sentiment.negativeDefault"
                          : ""
                      }
                      background={
                        (errors?.activity?.[title] as any)
                          ? "sentiment.negativeOverlay"
                          : ""
                      }
                      bgColor="base.light"
                      _focus={{
                        borderWidth: "1px",
                        shadow: "none",
                        borderColor: "content.link",
                      }}
                      {...register(`activity.${title}` as any)}
                    />
                  </NumberInput>
                  <InputRightAddon
                    className="border-l-2"
                    pl={4}
                    pr={0}
                    w="100px"
                    bgColor="base.light"
                    h="48px"
                    overflowX="hidden"
                    shadow="1dp"
                  >
                    <Controller
                      control={control}
                      name={`activity.${title}Unit` as any}
                      render={({ field }) => (
                        <Select
                          placeholder={t("select-unit")}
                          variant="unstyled"
                          {...field}
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
                  </InputRightAddon>
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
              </FormControl>
              <FormControl>
                <FormLabel>{t("emission-factor-type")}</FormLabel>
                <Select
                  borderRadius="4px"
                  borderWidth={errors?.activity?.emissionFactorType ? "1px" : 0}
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
                  {...register("activity.emissionFactorType")}
                  bgColor="base.light"
                  placeholder="Select emission factor type"
                  onChange={(e: any) => onEmissionFactorTypeChange(e)}
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
            </Box>
          ) : null}
        </HStack>
        {!methodology?.id.includes("direct-measure") ? (
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
                  <Controller
                    control={control}
                    name="activity.CO2EmissionFactor"
                    defaultValue={0}
                    render={({ field }) => (
                      <InputGroup>
                        <NumberInput
                          min={0}
                          isDisabled={isEmissionFactorInputDisabled}
                          {...field}
                          onChange={(valueAsString, valueAsNumber) =>
                            field.onChange(valueAsNumber)
                          }
                        >
                          <NumberInputField
                            h="48px"
                            type="number"
                            shadow="1dp"
                            borderRightRadius={0}
                            bgColor={
                              isEmissionFactorInputDisabled
                                ? "background.neutral"
                                : "base.light"
                            }
                            pos="relative"
                            zIndex={999}
                          />
                        </NumberInput>
                        <InputRightAddon
                          bgColor={
                            isEmissionFactorInputDisabled
                              ? "background.neutral"
                              : "base.light"
                          }
                          color="content.tertiary"
                          h="48px"
                          fontSize="14px"
                          shadow="1dp"
                          pos="relative"
                          zIndex={10}
                          pr={2}
                          pl={2}
                          w="100px"
                          overflowX="hidden"
                        >
                          <Text
                            isTruncated // Truncate the text with an ellipsis
                            noOfLines={1}
                            w="full"
                            textAlign="center"
                          >
                            CO2/{t(unitValue)}
                          </Text>
                        </InputRightAddon>
                      </InputGroup>
                    )}
                  />
                </FormControl>
              </FormControl>
              <FormControl>
                <FormLabel color="content.tertiary">
                  {t("n2o-emission-factor")}
                </FormLabel>
                <Controller
                  control={control}
                  name="activity.N2OEmissionFactor"
                  defaultValue={0}
                  render={({ field }) => (
                    <InputGroup>
                      <NumberInput
                        min={0}
                        isDisabled={isEmissionFactorInputDisabled}
                        {...field}
                        onChange={(valueAsString, valueAsNumber) =>
                          field.onChange(valueAsNumber)
                        }
                      >
                        <NumberInputField
                          h="48px"
                          type="number"
                          shadow="1dp"
                          borderRightRadius={0}
                          bgColor={
                            isEmissionFactorInputDisabled
                              ? "background.neutral"
                              : "base.light"
                          }
                          pos="relative"
                          zIndex={999}
                        />
                      </NumberInput>
                      <InputRightAddon
                        bgColor={
                          isEmissionFactorInputDisabled
                            ? "background.neutral"
                            : "base.light"
                        }
                        color="content.tertiary"
                        h="48px"
                        fontSize="14px"
                        shadow="1dp"
                        pos="relative"
                        zIndex={10}
                        pr={2}
                        pl={2}
                        w="100px"
                        overflowX="hidden"
                      >
                        <Text
                          isTruncated // Truncate the text with an ellipsis
                          noOfLines={1}
                          w="full"
                          textAlign="center"
                        >
                          N2O/{t(unitValue)}
                        </Text>
                      </InputRightAddon>
                    </InputGroup>
                  )}
                />
              </FormControl>
              <FormControl>
                <FormLabel color="content.tertiary">
                  {t("ch4-emission-factor")}
                </FormLabel>
                <Controller
                  control={control}
                  name="activity.CH4EmissionFactor"
                  defaultValue={0}
                  render={({ field }) => (
                    <InputGroup>
                      <NumberInput
                        min={0}
                        isDisabled={isEmissionFactorInputDisabled}
                        {...field}
                        onChange={(valueAsString, valueAsNumber) =>
                          field.onChange(valueAsNumber)
                        }
                      >
                        <NumberInputField
                          h="48px"
                          type="number"
                          shadow="1dp"
                          borderRightRadius={0}
                          bgColor={
                            isEmissionFactorInputDisabled
                              ? "background.neutral"
                              : "base.light"
                          }
                          pos="relative"
                          zIndex={999}
                        />
                      </NumberInput>
                      <InputRightAddon
                        bgColor={
                          isEmissionFactorInputDisabled
                            ? "background.neutral"
                            : "base.light"
                        }
                        color="content.tertiary"
                        h="48px"
                        fontSize="14px"
                        shadow="1dp"
                        pos="relative"
                        zIndex={10}
                        pr={2}
                        pl={2}
                        w="100px"
                        overflowX="hidden"
                      >
                        <Text
                          isTruncated // Truncate the text with an ellipsis
                          noOfLines={1}
                          w="full"
                          textAlign="center"
                        >
                          CH4/{t(unitValue)}
                        </Text>
                      </InputRightAddon>
                    </InputGroup>
                  )}
                />
              </FormControl>
            </HStack>{" "}
          </>
        ) : (
          <Grid templateColumns="repeat(2, 1fr)" gap={4} mb={5}>
            <FormControl w="full">
              <FormLabel color="content.secondary">
                {t("emissions-value-co2")}
              </FormLabel>
              <InputGroup w="full" shadow="1dp" borderRadius={"8px"}>
                {/* TODO translate values and use internal value for checking */}
                <NumberInput w="full" defaultValue={0} min={0}>
                  <NumberInputField
                    data-testid="co2-emission-factor"
                    type="number"
                    h="48px"
                    placeholder="Enter emissions value"
                    {...register("activity.CO2EmissionFactor")}
                    bgColor="base.light"
                    pos="relative"
                    zIndex={999}
                  />
                </NumberInput>
                <InputRightAddon
                  bgColor="base.light"
                  color="content.tertiary"
                  h="48px"
                  pos="relative"
                  zIndex={10}
                  {...register("activity.co2EmissionFactorUnit")}
                >
                  tCO2
                </InputRightAddon>
              </InputGroup>
            </FormControl>
            <FormControl w="full">
              <FormLabel color="content.secondary">
                {t("emissions-value-n2o")}
              </FormLabel>
              <InputGroup w="full" shadow="1dp" borderRadius={"8px"}>
                {/* TODO translate values and use internal value for checking */}
                <NumberInput w="full" defaultValue={0} min={0}>
                  <NumberInputField
                    data-testid="n2o-emission-factor"
                    type="number"
                    h="48px"
                    borderRightRadius={0}
                    placeholder="Enter emissions value"
                    {...register("activity.N2OEmissionFactor")}
                    bgColor="base.light"
                    pos="relative"
                    zIndex={999}
                  />
                </NumberInput>
                <InputRightAddon
                  bgColor="base.light"
                  color="content.tertiary"
                  borderLeft={"none"}
                  h="48px"
                  pos="relative"
                  zIndex={10}
                  {...register("activity.n2oEmissionFactorUnit")}
                >
                  tN2O
                </InputRightAddon>
              </InputGroup>
            </FormControl>
            <FormControl w="full">
              <FormLabel color="content.secondary">
                {t("emissions-value-ch4")}
              </FormLabel>
              <InputGroup w="full" shadow="1dp" borderRadius={"8px"}>
                {/* TODO translate values and use internal value for checking */}
                <NumberInput w="full " defaultValue={0} min={0}>
                  <NumberInputField
                    type="number"
                    data-testid="ch4-emission-factor"
                    h="48px"
                    borderRightRadius={0}
                    placeholder="Enter emissions value"
                    {...register("activity.CH4EmissionFactor")}
                    bgColor="base.light"
                    pos="relative"
                    zIndex={999}
                  />
                </NumberInput>
                <InputRightAddon
                  bgColor="base.light"
                  color="content.tertiary"
                  borderLeft={"none"}
                  h="48px"
                  pos="relative"
                  zIndex={10}
                  {...register("activity.ch4EmissionFactorUnit")}
                >
                  tCH4
                </InputRightAddon>
              </InputGroup>
            </FormControl>
          </Grid>
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
