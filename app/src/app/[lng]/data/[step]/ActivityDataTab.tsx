import { InfoOutlineIcon } from "@chakra-ui/icons";
import {
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  Heading,
  InputGroup,
  InputRightAddon,
  Link,
  NumberInput,
  NumberInputField,
  Select,
  Text,
  Textarea,
  Tooltip,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { Trans } from "react-i18next/TransWithoutContext";
import { resolve } from "@/util/helpers";

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
const emissionFactorTypes = [
  "Local",
  "Regional",
  "National",
  "IPCC",
  "Add custom",
];

export function ActivityDataTab({
  t,
  register,
  errors,
  prefix,
  watch,
  sectorNumber,
}: {
  t: TFunction;
  register: Function;
  errors: Record<string, any>;
  prefix: string;
  watch: Function;
  sectorNumber: string; // I, II, III
}) {
  const selectedUnit = watch(prefix + "activityDataUnit");
  const selectedEmissionFactorType = watch(prefix + "emissionFactorType");

  return (
    <>
      <HStack spacing={4} mb={12} className="items-start">
        <FormControl
          isInvalid={!!resolve(prefix + "activityDataAmount", errors)}
        >
          <FormLabel>
            {t("activity-data-amount")}{" "}
            <Tooltip
              hasArrow
              label={t("value-types-tooltip")}
              placement="bottom-start"
            >
              <InfoOutlineIcon mt={-0.5} color="content.tertiary" />
            </Tooltip>
          </FormLabel>
          <InputGroup>
            <NumberInput defaultValue={0} w="full">
              <NumberInputField
                placeholder={t("activity-data-amount-placeholder")}
                borderRightRadius={0}
                bgColor="base.light"
                {...register(prefix + "activityDataAmount", {
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
                {...register(prefix + "activityDataUnit")}
              >
                {activityDataUnits[sectorNumber].map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
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
            {...register(prefix + "emissionFactorType")}
            bgColor="base.light"
          >
            {/* TODO translate values and use internal value for saving */}
            {emissionFactorTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </FormControl>
      </HStack>
      <Heading size="sm" mb={4} className="font-normal">
        {t("emission-factors-values")}{" "}
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
            <NumberInput
              defaultValue={0}
              min={0}
              isDisabled={selectedEmissionFactorType !== "Add custom"}
            >
              <NumberInputField
                borderRightRadius={0}
                {...register(prefix + "co2EmissionFactor")}
                bgColor="background.neutral"
              />
            </NumberInput>
            <InputRightAddon
              bgColor="background.neutral"
              color="content.tertiary"
            >
              CO2/{selectedUnit}
            </InputRightAddon>
          </InputGroup>
          <FormHelperText>&nbsp;</FormHelperText>
        </FormControl>
        <FormControl>
          <FormLabel color="content.tertiary">
            {t("n2o-emission-factor")}
          </FormLabel>
          <InputGroup>
            <NumberInput
              defaultValue={0}
              min={0}
              isDisabled={selectedEmissionFactorType !== "Add custom"}
            >
              <NumberInputField
                borderRightRadius={0}
                {...register(prefix + "n2oEmissionFactor")}
                bgColor="background.neutral"
              />
            </NumberInput>
            <InputRightAddon
              bgColor="background.neutral"
              color="content.tertiary"
            >
              N2O/{selectedUnit}
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
            <NumberInput
              defaultValue={0}
              min={0}
              isDisabled={selectedEmissionFactorType !== "Add custom"}
            >
              <NumberInputField
                borderRightRadius={0}
                {...register(prefix + "ch4EmissionFactor")}
                bgColor="background.neutral"
              />
            </NumberInput>
            <InputRightAddon
              bgColor="background.neutral"
              color="content.tertiary"
            >
              CH4/{selectedUnit}
            </InputRightAddon>
          </InputGroup>
          <FormHelperText color="content.tertiary">
            {t("optional")}
          </FormHelperText>
        </FormControl>
      </HStack>
      <HStack className="items-start" mb={5}>
        <InfoOutlineIcon mt={1} color="content.link" />
        <Text color="content.tertiary">{t("emissions-factor-details")}</Text>
      </HStack>
      <FormControl
        isInvalid={!!resolve(prefix + "sourceReference", errors)}
        mb={12}
      >
        <FormLabel>{t("source-reference")}</FormLabel>
        <Textarea
          placeholder={t("source-reference-placeholder")}
          bgColor="base.light"
          {...register(prefix + "sourceReference", {
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
          <Trans t={t} i18nKey="calculations-details">
            All calculations use the{" "}
            <Link
              href="https://www.ipcc.ch/report/ar6/wg1/downloads/report/IPCC_AR6_WGI_Chapter07.pdf#page=95"
              target="_blank"
              rel="noreferrer"
            >
              IPCC AR6 100-year GWPs
            </Link>
            .
          </Trans>
        </Text>
      </HStack>
    </>
  );
}
