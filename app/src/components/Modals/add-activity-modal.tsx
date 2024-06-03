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
import { InfoOutlineIcon } from "@chakra-ui/icons";
import { Trans } from "react-i18next";
import Link from "next/link";

import type {
  ActivityData,
  DirectMeasureData,
  SubcategoryData,
  EmissionsFactorData,
} from "../../app/[lng]/[inventory]/data/[step]/types";
import { groupBy, resolve } from "@/util/helpers";

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  t: TFunction;
  userInfo: UserAttributes | null;
  defaultCityId?: string;
  setHasActivityData: Function;
  hasActivityData: boolean;
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

  const { inventory: cityParam } = useParams();
  const inventoryId = cityParam as string;

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    console.log(data);
    setHasActivityData(!hasActivityData);
    onClose();
  };

  return (
    <>
      <Modal blockScrollOnMount={false} isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent minH="300px" minW="768px" marginTop="10%">
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
                    options={[
                      t("commercial-buildings"),
                      t("institutional-buildings"),
                      t("street-lights"),
                    ]}
                    title={t("building-type")}
                    placeholder={t("select-type-of-building")}
                    register={register}
                    activity="buildingType"
                  />
                </FormControl>
                <FormControl>
                  <BuildingTypeSelectInput
                    options={[
                      t("all-fuels"),
                      t("natural-gas"),
                      t("propane"),
                      t("heating-oil"),
                    ]}
                    title={t("fuel-type")}
                    placeholder={t("select-type-of-fuel")}
                    register={register}
                    activity="fuelType"
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
                    <FormLabel>{t("total-fuel-consumption")}</FormLabel>
                    <InputGroup>
                      <NumberInput defaultValue={0} w="full">
                        <NumberInputField
                          placeholder={t("activity-data-amount-placeholder")}
                          borderRightRadius={0}
                          bgColor="base.light"
                          {...register("activity.activityDataAmount", {
                            required: t("value-required"),
                          })}
                        />
                      </NumberInput>
                      <InputRightAddon
                        className="border-l-2"
                        pl={4}
                        pr={0}
                        bgColor="base.light"
                      >
                        <Select
                          variant="unstyled"
                          {...register("activity.activityDataUnit")}
                        >
                          <option value="1">{t("gallons")} (gal)</option>
                          <option value="1">{t("liters")} (L)</option>
                          <option value="1">{t("cubic-meters")} (m3)</option>
                          <option value="1">{t("kilograms")} (kg)</option>
                          <option value="1">{t("terahoules")} (Tj)</option>
                          <option value="1">{t("kilowatt-hour")} (kWh)</option>
                        </Select>
                      </InputRightAddon>
                    </InputGroup>
                    <FormErrorMessage>
                      {resolve(prefix + "activityDataAmount", errors)?.message}
                    </FormErrorMessage>
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("emission-factor-type")}</FormLabel>
                    <Select
                      {...register("activity.emissionFactorType")}
                      bgColor="base.light"
                      placeholder="Select emission factor type"
                    >
                      {/* TODO translate values and use internal value for saving */}
                      <option value="local">{t("local")}</option>
                      <option value="regional">{t("regional")}</option>
                      <option value="national">{t("national")}</option>
                      <option value="ipcc">IPCC</option>
                      <option key="custom" value="custom">
                        {t("add-custom")}
                      </option>
                    </Select>
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
                        borderRightRadius={0}
                        {...register("activity.co2EmissionFactor")}
                        bgColor="background.neutral"
                      />
                    </NumberInput>
                    <InputRightAddon
                      bgColor="background.neutral"
                      color="content.tertiary"
                    >
                      CO2/Gal
                    </InputRightAddon>
                  </InputGroup>
                  <FormHelperText>&nbsp;</FormHelperText>
                </FormControl>
                <FormControl>
                  <FormLabel color="content.tertiary">
                    {t("n2o-emission-factor")}
                  </FormLabel>
                  <InputGroup>
                    <NumberInput defaultValue={0} min={0} isDisabled={true}>
                      <NumberInputField
                        borderRightRadius={0}
                        {...register("activity.n2oEmissionFactor")}
                        bgColor="background.neutral"
                      />
                    </NumberInput>
                    <InputRightAddon
                      bgColor="background.neutral"
                      color="content.tertiary"
                    >
                      NO2/Gal
                    </InputRightAddon>
                  </InputGroup>
                  <FormHelperText color="content.tertiary">
                    {t("optional")}
                  </FormHelperText>
                </FormControl>
                <FormControl>
                  <FormLabel color="content.tertiary">
                    {t("ch4-emission-factor")}
                  </FormLabel>
                  <InputGroup>
                    <NumberInput defaultValue={0} min={0} isDisabled={true}>
                      <NumberInputField
                        borderRightRadius={0}
                        {...register("activity.ch4EmissionFactor")}
                        bgColor="background.neutral"
                      />
                    </NumberInput>
                    <InputRightAddon
                      bgColor="background.neutral"
                      color="content.tertiary"
                    >
                      CH4/Gal
                    </InputRightAddon>
                  </InputGroup>
                  <FormHelperText color="content.tertiary">
                    {t("optional")}
                  </FormHelperText>
                </FormControl>
              </HStack>

              <FormControl
                isInvalid={!!resolve(prefix + "dataQuality", errors)}
                mb={12}
              >
                <FormLabel>{t("data-quality")}</FormLabel>
                <Select
                  bgColor="base.light"
                  placeholder={t("data-quality-placeholder")}
                  {...register("activity.dataQuality", {
                    required: t("option-required"),
                  })}
                >
                  <option value="high">{t("detailed-emissions-data")}</option>
                  <option value="medium">{t("modeled-emissions-data")}</option>
                  <option value="low">
                    {t("highly-modeled-uncertain-emissions-data")}
                  </option>
                </Select>
                <FormErrorMessage>
                  {resolve(prefix + "dataQuality", errors)?.message}
                </FormErrorMessage>
              </FormControl>
              <FormControl
                isInvalid={!!resolve(prefix + "sourceReference", errors)}
                mb={12}
              >
                <FormLabel>{t("source-reference")}</FormLabel>
                <Textarea
                  placeholder={t("source-reference-placeholder")}
                  {...register("activity.sourceReference", {
                    required: t("source-reference-required"),
                  })}
                />
                <FormErrorMessage>
                  {resolve(prefix + "sourceReference", errors)?.message}
                </FormErrorMessage>
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
              // isLoading={}
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
