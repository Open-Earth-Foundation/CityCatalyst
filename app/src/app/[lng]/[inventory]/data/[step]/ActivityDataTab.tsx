import { MdOutlineInfo } from "react-icons/md";
import {
  Icon,
  HStack,
  Heading,
  Link,
  NumberInput,
  Select,
  Text,
  Textarea,
  Group,
  InputAddon,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { Trans } from "react-i18next/TransWithoutContext";
import { resolve, groupBy } from "@/util/helpers";
import type { EmissionsFactorWithDataSources } from "@/util/types";
import type { EmissionsFactorData } from "./types";
import { useEffect } from "react";
import { getTranslationFromDict } from "@/i18n";
import { InputGroup } from "@/components/ui/input-group";
import {
  NumberInputField,
  NumberInputRoot,
} from "@/components/ui/number-input";
import { Tooltip } from "@/components/ui/tooltip";
import { Field } from "@/components/ui/field";

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
/*const emissionFactorTypes = [
  "Local",
  "Regional",
  "National",
  "IPCC",
  "Add custom",
];*/

export function determineEmissionsFactorType(factor: EmissionsFactorData) {
  const sourceName =
    getTranslationFromDict(factor.dataSources?.[0]?.datasetName ?? {}) ??
    "Unknown data source";
  if (sourceName.includes("IPCC") && sourceName.includes("US")) {
    return "National (US)";
  } else if (sourceName.includes("IPCC")) {
    return "IPCC";
  }

  return sourceName;
}

export function ActivityDataTab({
  t,
  register,
  errors,
  prefix,
  watch,
  setValue,
  gpcReferenceNumber,
  emissionsFactors,
}: {
  t: TFunction;
  register: Function;
  errors: Record<string, any>;
  prefix: string;
  watch: Function;
  setValue: Function;
  gpcReferenceNumber: string;
  emissionsFactors: EmissionsFactorWithDataSources[];
}) {
  const selectedEmissionFactorType =
    watch(prefix + "emissionFactorType") || "custom";
  // TODO cache with useEffect and useState?
  const scopeEmissionsFactors = emissionsFactors.filter(
    (factor) => factor.gpcReferenceNumber === gpcReferenceNumber,
  );
  // const selectedEmissionsFactors = scopeEmissionsFactors.filter((factor) => factor.dataSources[0].datasourceId === selectedEmissionFactorType.datasourceId);
  const factorsByType = groupBy(
    scopeEmissionsFactors,
    determineEmissionsFactorType,
  );
  const emissionsFactorTypes = Object.keys(factorsByType);
  const selectedEmissionsFactors =
    factorsByType[selectedEmissionFactorType] || [];
  const factorsByUnit = groupBy(
    selectedEmissionsFactors,
    (factor) => factor.units || "Unknown unit",
  );
  const sectorReference = gpcReferenceNumber.split(".")[0];
  const customUnits = activityDataUnits[sectorReference].map(
    (unit) => "kg/" + unit,
  );
  const scopeUnits =
    selectedEmissionFactorType === "custom"
      ? customUnits
      : Object.keys(factorsByUnit);

  // TODO this should happen in default form value, as the form still contains null/ undefined here
  const selectedUnit =
    watch(prefix + "activityDataUnit") ?? scopeUnits[0] ?? "";
  const selectedUnitShort = selectedUnit.split(" ")[0];

  useEffect(() => {
    if (selectedEmissionFactorType === "custom") {
      return;
    }

    // TODO overwrite selectedUnit / selectedEmissionFactorType
    // with first unit in list when it's null

    const selectedFactorsByGas =
      factorsByUnit[selectedUnit]?.reduce(
        (acc, factor) => {
          if (factor.gas) {
            acc[factor.gas] = factor;
          }
          return acc;
        },
        {} as Record<string, EmissionsFactorWithDataSources>,
      ) || {};

    // TODO these don't change the input values!
    setValue(
      prefix + "co2EmissionFactor",
      selectedFactorsByGas.CO2?.emissionsPerActivity || 0,
    );
    setValue(
      prefix + "ch4EmissionFactor",
      selectedFactorsByGas.CH4?.emissionsPerActivity || 0,
    );
    setValue(
      prefix + "n2oEmissionFactor",
      selectedFactorsByGas.N2O?.emissionsPerActivity || 0,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnit, selectedEmissionFactorType, setValue]);

  return (
    <>
      <HStack spaceX={4} spaceY={4} mb={12} className="items-start">
        <Field
          invalid={!!resolve(prefix + "activityDataAmount", errors)}
          errorText={resolve(prefix + "activityDataAmount", errors)?.message}
          label={
            <>
              {t("activity-data-amount")}{" "}
              <Tooltip
                showArrow
                content={t("value-types-tooltip")}
                positioning={{ placement: "bottom-start" }}
              >
                <Icon as={MdOutlineInfo} mt={-0.5} color="content.tertiary" />
              </Tooltip>
            </>
          }
        >
          <Group attached>
            <NumberInputRoot defaultValue="0" w="full">
              <NumberInputField
                placeholder={t("activity-data-amount-placeholder")}
                borderRightRadius={0}
                bgColor="base.light"
                {...register(prefix + "activityDataAmount", {
                  required: t("value-required"),
                })}
              />
            </NumberInputRoot>
            <InputAddon
              className="border-l-2"
              pl={4}
              pr={0}
              bgColor="base.light"
            >
              <Select.Root
                variant="unstyled"
                {...register(prefix + "activityDataUnit")}
              >
                {scopeUnits.map((unit) => (
                  <option key={unit} value={unit}>
                    {t(unit)}
                  </option>
                ))}
              </Select.Root>
            </InputAddon>
          </Group>
        </Field>
        <Field label={t("emission-factor-type")}>
          <Select.Root
            {...register(prefix + "emissionFactorType")}
            bgColor="base.light"
          >
            {/* TODO translate values and use internal value for saving */}
            {emissionsFactorTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
            <option key="custom" value="custom">
              {t("add-custom")}
            </option>
          </Select.Root>
        </Field>
      </HStack>
      <Heading size="sm" mb={4} className="font-normal">
        {t("emission-factors-values")}{" "}
        <Tooltip
          showArrow
          content={t("value-types-tooltip")}
          positioning={{ placement: "bottom-start" }}
        >
          <Icon as={MdOutlineInfo} mt={-0.5} color="content.tertiary" />
        </Tooltip>
      </Heading>
      <HStack spaceX={4} spaceY={4} mb={5}>
        <Field label={t("co2-emission-factor")} labelColor="content.tertiary">
          <Group attached>
            {/* TODO translate values and use internal value for checking */}
            <NumberInputRoot
              defaultValue="0"
              min={0}
              disabled={selectedEmissionFactorType !== "custom"}
            >
              <NumberInputField
                borderRightRadius={0}
                {...register(prefix + "co2EmissionFactor")}
                bgColor="background.neutral"
              />
              =
            </NumberInputRoot>
            <InputAddon bgColor="background.neutral" color="content.tertiary">
              {selectedUnitShort}
            </InputAddon>
          </Group>
        </Field>
        <Field
          label={t("n2o-emission-factor")}
          helperText={t("optional")}
          labelColor="content.tertiary"
        >
          <Group attached>
            <NumberInputRoot
              defaultValue="0"
              min={0}
              disabled={selectedEmissionFactorType !== "custom"}
            >
              <NumberInputField
                borderRightRadius={0}
                {...register(prefix + "n2oEmissionFactor")}
                bgColor="background.neutral"
              />
            </NumberInputRoot>
            <InputAddon bgColor="background.neutral" color="content.tertiary">
              {selectedUnitShort}
            </InputAddon>
          </Group>
        </Field>
        <Field
          label={t("ch4-emission-factor")}
          helperText={t("optional")}
          labelColor="content.tertiary"
        >
          <Group attached>
            <NumberInputRoot
              defaultValue="0"
              min={0}
              disabled={selectedEmissionFactorType !== "custom"}
            >
              <NumberInputField
                borderRightRadius={0}
                {...register(prefix + "ch4EmissionFactor")}
                bgColor="background.neutral"
              />
            </NumberInputRoot>
            <InputAddon bgColor="background.neutral" color="content.tertiary">
              {selectedUnitShort}
            </InputAddon>
          </Group>
        </Field>
      </HStack>
      <HStack className="items-start" mb={5}>
        <Icon as={MdOutlineInfo} mt={1} color="content.link" />
        <Text color="content.tertiary">{t("emissions-factor-details")}</Text>
      </HStack>
      <Field
        invalid={!!resolve(prefix + "dataQuality", errors)}
        label={t("data-quality")}
        errorText={resolve(prefix + "dataQuality", errors)?.message}
        mb={12}
      >
        <Select.Root
          bgColor="base.light"
          placeholder={t("data-quality-placeholder")}
          {...register(prefix + "dataQuality", {
            required: t("option-required"),
          })}
        >
          <option value="high">{t("detailed-emissions-data")}</option>
          <option value="medium">{t("modeled-emissions-data")}</option>
          <option value="low">
            {t("highly-modeled-uncertain-emissions-data")}
          </option>
        </Select.Root>
      </Field>
      <Field
        label={t("source-reference")}
        invalid={!!resolve(prefix + "sourceReference", errors)}
        errorText={resolve(prefix + "sourceReference", errors)?.message}
        mb={12}
      >
        <Textarea
          placeholder={t("source-reference-placeholder")}
          {...register(prefix + "sourceReference", {
            required: t("source-reference-required"),
          })}
        />
      </Field>
      <HStack className="items-start" mb={13}>
        <Icon as={MdOutlineInfo} mt={1} color="content.link" />
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
