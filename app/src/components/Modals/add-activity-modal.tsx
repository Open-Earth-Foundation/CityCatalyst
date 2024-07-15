"use client";

import { ProfileInputs } from "@/app/[lng]/[inventory]/settings/page";
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
import { MdCheckCircleOutline } from "react-icons/md";
import FormInput from "../form-input";
import FormSelectInput from "../form-select-input";
import FormSelectOrganization from "../form-select-organization";
import { TFunction } from "i18next";
import { useParams } from "next/navigation";
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

  const formInputs = formStruct.formInputs;

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
                    options={formInputs.fields[0].options}
                    title={formStruct.formInputs.fields[0].label}
                    placeholder={t("select-type-of-building")}
                    register={register}
                    activity="buildingType"
                    errors={errors}
                  />
                </FormControl>
                <FormControl>
                  <BuildingTypeSelectInput
                    options={formInputs.fields[1].options}
                    title={formInputs.fields[1].label}
                    placeholder={t("select-type-of-fuel")}
                    register={register}
                    activity="fuelType"
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
                    <FormLabel>{formInputs.fields[2].label}</FormLabel>
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
                          {...register("activity.totalFuelConsumption", {
                            required: t("value-required"),
                          })}
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
                          {...register("activity.activityDataUnit")}
                        >
                          {formInputs.fields[2].options?.map((item: string) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
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
                    <FormLabel>{formInputs.fields[3].label}</FormLabel>
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
                      {...register("activity.emissionFactorType")}
                      bgColor="base.light"
                      placeholder="Select emission factor type"
                    >
                      {/* TODO translate values and use internal value for saving */}
                      {formInputs.fields[3].options?.map((item: string) => (
                        <option key={item} value="local">
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
                <Tooltip
                  hasArrow
                  label={t("value-types-tooltip")}
                  placement="bottom-start"
                >
                  <InfoOutlineIcon mt={-0.5} color="content.tertiary" />
                </Tooltip>
              </Heading>
              <HStack spacing={4} mb={5}>
                <FormControl>
                  <FormLabel color="content.tertiary">
                    {t("co2-emission-factor")}
                  </FormLabel>
                  <InputGroup>
                    {/* TODO translate values and use internal value for checking */}
                    <NumberInput defaultValue={0} min={0} isDisabled={true}>
                      <NumberInputField
                        h="48px"
                        shadow="1dp"
                        borderRightRadius={0}
                        {...register("activity.co2EmissionFactor")}
                        bgColor="background.neutral"
                        pos="relative"
                        zIndex={999}
                      />
                    </NumberInput>
                    <InputRightAddon
                      bgColor="background.neutral"
                      color="content.tertiary"
                      h="48px"
                      shadow="1dp"
                      pos="relative"
                      zIndex={10}
                    >
                      {formInputs.fields[4].unit}
                    </InputRightAddon>
                  </InputGroup>
                </FormControl>
                <FormControl>
                  <FormLabel color="content.tertiary">
                    {t("n2o-emission-factor")}
                  </FormLabel>
                  <InputGroup>
                    <NumberInput defaultValue={0} min={0} isDisabled={true}>
                      <NumberInputField
                        _focus={{
                          borderWidth: "1px",
                          shadow: "none",
                          borderColor: "content.link",
                        }}
                        borderRightRadius={0}
                        {...register("activity.n2oEmissionFactor")}
                        bgColor="background.neutral"
                        h="48px"
                        shadow="1dp"
                        pos="relative"
                        zIndex={999}
                      />
                    </NumberInput>
                    <InputRightAddon
                      bgColor="background.neutral"
                      color="content.tertiary"
                      h="48px"
                      shadow="1dp"
                      pos="relative"
                      zIndex={10}
                    >
                      {formInputs.fields[5].unit}
                    </InputRightAddon>
                  </InputGroup>
                </FormControl>
                <FormControl>
                  <FormLabel color="content.tertiary">
                    {t("ch4-emission-factor")}
                  </FormLabel>
                  <InputGroup>
                    <NumberInput defaultValue={0} min={0} isDisabled={true}>
                      <NumberInputField
                        _focus={{
                          borderWidth: "1px",
                          shadow: "none",
                          borderColor: "content.link",
                        }}
                        borderRightRadius={0}
                        {...register("activity.ch4EmissionFactor")}
                        bgColor="background.neutral"
                        h="48px"
                        shadow="1dp"
                        pos="relative"
                        zIndex={999}
                      />
                    </NumberInput>
                    <InputRightAddon
                      bgColor="background.neutral"
                      color="content.tertiary"
                      h="48px"
                      shadow="1dp"
                      pos="relative"
                      zIndex={10}
                    >
                      {formInputs.fields[6].unit}
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
                  color="content.tertiary"
                >
                  <option value="high">{t("detailed-activity-data")}</option>
                  <option value="medium">{t("modeled-emissions-data")}</option>
                  <option value="low">
                    {t("highly-modeled-uncertain-emissions-data")}
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
                  All calculations consider a GWP value of X.
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
