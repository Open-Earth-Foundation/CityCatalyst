"use client";

import type { UserAttributes } from "@/models/User";
import { api } from "@/services/api";
import {
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  Heading,
  InputGroup,
  InputRightAddon,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  NumberInput,
  NumberInputField,
  Select,
  Text,
  Textarea,
  Tooltip,
  useToast,
} from "@chakra-ui/react";
import { FC, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { TFunction } from "i18next";
import BuildingTypeSelectInput from "../building-select-input";
import {
  CheckCircleIcon,
  InfoOutlineIcon,
  WarningIcon,
} from "@chakra-ui/icons";
import { Trans } from "react-i18next";
import Link from "next/link";

import type {
  ActivityData,
  DirectMeasureData,
  SubcategoryData,
  EmissionsFactorData,
} from "../../app/[lng]/[inventory]/data/[step]/types";
import { groupBy, resolve } from "@/util/helpers";
import { ActivityDataScope } from "@/features/city/subsectorSlice";

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  t: TFunction;
  userInfo: UserAttributes | null;
  defaultCityId?: string;
  setHasActivityData: Function;
  hasActivityData: boolean;
  formStruct: ActivityDataScope;
  inventoryId: string;
  step: string;
  scope: number;
}

export type Inputs = {
  methodology: "fuel-combustion-consuption" | "direct-measure" | "";
  fuelType: "all-fuels" | "natural-gas" | "propane" | "heating-oil";
  activity: {
    activityDataAmount?: number | null | undefined;
    activityDataUnit?: string | null | undefined;
    emissionFactorType: string;
    co2EmissionFactor: number;
    n2oEmissionFactor: number;
    ch4EmissionFactor: number;
    dataQuality: string;
    sourceReference: string;
    buildingType: string;
    fuelType: string;
    totalFuelConsumption: string;
    formStruct: ActivityDataScope;
  };
  direct: DirectMeasureData;
  subcategoryData: Record<string, SubcategoryData>;
};

const activityDataUnits: Record<string, string[]> = {
  I: [
    "l",
    "m3",
    "ft3",
    "bbl",
    "gal (US)",
    "gal (UK)",
    "MWh",
    "GJ",
    "BTUs",
    "MW",
    "Other",
  ],
  II: ["l", "m3", "ft3", "bbl", "gal (US)", "gal (UK)", "km", "mi", "Other"],
  III: ["g", "kg", "t", "kt", "lt", "st", "lb", "Other"],
};

export function determineEmissionsFactorType(factor: EmissionsFactorData) {
  let sourceName = factor.dataSources
    ? factor.dataSources[0].datasetName || "Unknown data source"
    : "Unknown data source";
  if (sourceName.includes("IPCC") && sourceName.includes("US")) {
    return "National (US)";
  } else if (sourceName.includes("IPCC")) {
    return "IPCC";
  }

  return sourceName;
}

const AddActivityModal: FC<AddUserModalProps> = ({
  isOpen,
  onClose,
  t,
  setHasActivityData,
  hasActivityData,
  formStruct,
  inventoryId,
  step,
  scope,
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty, isValid },
    watch,
    reset,
    control,
    setValue,
  } = useForm<Inputs>();

  let prefix = "";
  let emissionsFactors: any = [];

  const toast = useToast();

  const [createActivityValue, { isLoading }] =
    api.useCreateActivityValueMutation();

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    setHasActivityData(!hasActivityData);
    await createActivityValue({ inventoryId, data }).then((res: any) => {
      if (res.data) {
        toast({
          status: "success",
          duration: 1200,
          title: "New activity data successfully added!",
          render: ({ title }) => (
            <Box
              h="48px"
              w="600px"
              borderRadius="8px"
              display="flex"
              alignItems="center"
              color="white"
              backgroundColor="interactive.primary"
              gap="8px"
              px="16px"
            >
              <CheckCircleIcon />
              <Text>{title}</Text>
            </Box>
          ),
        });
        onClose();
      } else {
        toast({
          status: "error",
          title: "Something went wrong!",
        });
      }
    });
  };

  const defaultScope = 1;

  const formInputs = formStruct?.formInputs[step][scope ?? defaultScope];

  const [isEmissionFactorInputDisabled, setIsEmissionFactorInputDisabled] =
    useState<boolean>(true);

  // Adjust function for countries with national emission factors i.e US
  const onEmissionFactorTypeChange = (e: any) => {
    const emissionFactorType = e.target.value;
    if (
      emissionFactorType === "Local" ||
      emissionFactorType === "Regional" ||
      emissionFactorType === "National"
    ) {
      setIsEmissionFactorInputDisabled(false);
    } else {
      setIsEmissionFactorInputDisabled(true);
    }
  };

  // Todo - Get activity key to infer fields form names properly
  type ActivityKey = any;

  return (
    <>
      <Modal blockScrollOnMount={false} isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent minH="300px" minW="768px" marginTop="2%">
          <ModalHeader
            display="flex"
            justifyContent="center"
            fontWeight="semibold"
            fontSize="headline.sm"
            fontFamily="heading"
            lineHeight="32"
            padding="24px"
            borderBottomWidth="1px"
            borderStyle="solid"
            borderColor="border.neutral"
          >
            {t("add-activity")}
          </ModalHeader>
          <ModalCloseButton marginTop="10px" />
          <ModalBody p={6} px={12}>
            <form onSubmit={handleSubmit(onSubmit)}>
              <HStack
                spacing={4}
                mb="24px"
                display="flex"
                flexDirection="column"
                className="items-start"
                gap="24px"
              >
                <FormControl className="w-full">
                  <BuildingTypeSelectInput
                    options={formInputs?.fields[0].options || []}
                    title={formInputs?.fields[0].label}
                    placeholder={t("select-type-of-building")}
                    register={register}
                    activity={"activity." + formInputs?.fields[0].name}
                    errors={errors}
                  />
                </FormControl>
                <FormControl>
                  <BuildingTypeSelectInput
                    options={formInputs?.fields[1].options}
                    title={formInputs?.fields[1].label}
                    placeholder={t("select-type-of-fuel")}
                    register={register}
                    activity={"activity." + formInputs?.fields[1].name}
                    errors={errors}
                  />
                </FormControl>
                <Box
                  display="flex"
                  justifyContent="space-between"
                  gap="16px"
                  w="full"
                >
                  <FormControl
                    isInvalid={!!resolve(prefix + "activityDataAmount", errors)}
                  >
                    <FormLabel>{formInputs?.fields[2].label}</FormLabel>
                    <InputGroup>
                      <NumberInput defaultValue={0} w="full">
                        <NumberInputField
                          borderRadius="4px"
                          placeholder={t("activity-data-amount-placeholder")}
                          borderRightRadius={0}
                          h="48px"
                          shadow="1dp"
                          borderWidth={
                            errors?.activity?.totalFuelConsumption ? "1px" : 0
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
                          {...register(
                            ("activity." +
                              formInputs?.fields[2].name) as ActivityKey,
                            {
                              required: t("value-required"),
                            },
                          )}
                        />
                      </NumberInput>
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
                          {...register(
                            ("activity." +
                              formInputs?.fields[2].addon?.name) as ActivityKey,
                          )}
                        >
                          {formInputs?.fields[2].addon?.options?.map(
                            (item: string) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ),
                          )}
                        </Select>
                      </InputRightAddon>
                    </InputGroup>

                    {errors.activity?.totalFuelConsumption ? (
                      <Box
                        display="flex"
                        gap="6px"
                        alignItems="center"
                        mt="6px"
                      >
                        <WarningIcon color="sentiment.negativeDefault" />
                        <Text fontSize="body.md">Please enter amount</Text>
                      </Box>
                    ) : (
                      ""
                    )}
                  </FormControl>
                  <FormControl>
                    <FormLabel>{formInputs?.fields[3].label}</FormLabel>
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
                      {...register(
                        ("activity." +
                          formInputs?.fields[3].name) as ActivityKey,
                      )}
                      bgColor="base.light"
                      placeholder="Select emission factor type"
                      onChange={(e: any) => onEmissionFactorTypeChange(e)}
                    >
                      {/* TODO translate values and use internal value for saving */}
                      {formInputs?.fields[3].options?.map((item: string) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </Select>
                    {errors.activity?.emissionFactorType ? (
                      <Box
                        display="flex"
                        gap="6px"
                        alignItems="center"
                        mt="6px"
                      >
                        <WarningIcon color="sentiment.negativeDefault" />
                        <Text fontSize="body.md">
                          Please select an emission factor type
                        </Text>
                      </Box>
                    ) : (
                      ""
                    )}
                  </FormControl>
                </Box>
              </HStack>
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
                  <FormLabel color="content.tertiary">
                    {formInputs?.fields[4]?.label}
                  </FormLabel>
                  <InputGroup>
                    {/* TODO translate values and use internal value for checking */}
                    <NumberInput
                      defaultValue={0}
                      min={0}
                      isDisabled={isEmissionFactorInputDisabled}
                    >
                      <NumberInputField
                        h="48px"
                        shadow="1dp"
                        borderRightRadius={0}
                        {...register(
                          ("activity." +
                            formInputs?.fields[4]?.name) as ActivityKey,
                        )}
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
                      shadow="1dp"
                      pos="relative"
                      zIndex={10}
                      {...register(
                        ("activity." +
                          formInputs?.fields[4]?.name) as ActivityKey,
                      )}
                    >
                      {formInputs?.fields[4].unit}
                    </InputRightAddon>
                  </InputGroup>
                </FormControl>
                <FormControl>
                  <FormLabel color="content.tertiary">
                    {formInputs?.fields[5].label}
                  </FormLabel>
                  <InputGroup>
                    <NumberInput
                      defaultValue={0}
                      min={0}
                      isDisabled={isEmissionFactorInputDisabled}
                    >
                      <NumberInputField
                        _focus={{
                          borderWidth: "1px",
                          shadow: "none",
                          borderColor: "content.link",
                        }}
                        borderRightRadius={0}
                        {...register(formInputs?.fields[5].name as ActivityKey)}
                        bgColor={
                          isEmissionFactorInputDisabled
                            ? "background.neutral"
                            : "base.light"
                        }
                        h="48px"
                        shadow="1dp"
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
                      shadow="1dp"
                      pos="relative"
                      zIndex={10}
                      {...register(
                        ("activity." +
                          formInputs?.fields[5].name) as ActivityKey,
                      )}
                    >
                      {formInputs?.fields[5].unit}
                    </InputRightAddon>
                  </InputGroup>
                </FormControl>
                <FormControl>
                  <FormLabel color="content.tertiary">
                    {formInputs?.fields[6].label}
                  </FormLabel>
                  <InputGroup>
                    <NumberInput
                      defaultValue={0}
                      min={0}
                      isDisabled={isEmissionFactorInputDisabled}
                    >
                      <NumberInputField
                        _focus={{
                          borderWidth: "1px",
                          shadow: "none",
                          borderColor: "content.link",
                        }}
                        borderRightRadius={0}
                        {...register(
                          ("activity." +
                            formInputs?.fields[6].name) as ActivityKey,
                        )}
                        bgColor={
                          isEmissionFactorInputDisabled
                            ? "background.neutral"
                            : "base.light"
                        }
                        h="48px"
                        shadow="1dp"
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
                      shadow="1dp"
                      pos="relative"
                      zIndex={10}
                      {...register(
                        ("activity." +
                          formInputs?.fields[6].name) as ActivityKey,
                      )}
                    >
                      {formInputs?.fields[6].unit}
                    </InputRightAddon>
                  </InputGroup>
                </FormControl>
              </HStack>

              <FormControl
                isInvalid={!!resolve(prefix + "dataQuality", errors)}
                mb={12}
              >
                <FormLabel>{t("data-quality")}</FormLabel>
                <Select
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
                    <Text fontSize="body.md">Please select data quality</Text>
                  </Box>
                ) : (
                  ""
                )}
              </FormControl>
              <FormControl
                isInvalid={!!resolve(prefix + "sourceReference", errors)}
                mb={12}
              >
                <FormLabel>{t("source-reference")}</FormLabel>
                <Textarea
                  borderWidth={errors?.activity?.dataQuality ? "1px" : 0}
                  border="inputBox"
                  borderRadius="4px"
                  shadow="1dp"
                  h="96px"
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
                  placeholder={t("source-reference-placeholder")}
                  {...register("activity.sourceReference", {
                    required: t("source-reference-required"),
                  })}
                />
                {errors.activity?.sourceReference ? (
                  <Box display="flex" gap="6px" alignItems="center" mt="6px">
                    <WarningIcon color="sentiment.negativeDefault" />
                    <Text fontSize="body.md">
                      Please select a source reference
                    </Text>
                  </Box>
                ) : (
                  ""
                )}
              </FormControl>
              <HStack className="items-start" mb={13}>
                <InfoOutlineIcon mt={1} color="content.link" />
                <Text color="content.tertiary">
                  All calculations consider a{" "}
                  <Text as="span" fontWeight="bold">
                    GWP value of 28 for CH4 and 265 for N20 (Version AR5).
                  </Text>
                </Text>
              </HStack>
            </form>
          </ModalBody>
          <ModalFooter
            borderTopWidth="1px"
            borderStyle="solid"
            borderColor="border.neutral"
            w="full"
            display="flex"
            alignItems="center"
            p="24px"
            justifyContent="center"
          >
            <Button
              h="56px"
              w="full"
              paddingTop="16px"
              paddingBottom="16px"
              px="24px"
              letterSpacing="widest"
              textTransform="uppercase"
              fontWeight="semibold"
              fontSize="button.md"
              type="submit"
              isLoading={isLoading}
              onClick={handleSubmit(onSubmit)}
              p={0}
              m={0}
            >
              Add Activity
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default AddActivityModal;
