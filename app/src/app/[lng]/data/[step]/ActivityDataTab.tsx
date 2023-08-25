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
  NumberInput,
  NumberInputField,
  Select,
  TabPanel,
  Text,
  Textarea,
  Tooltip,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { Trans } from "react-i18next/TransWithoutContext";

const activityDataUnits = ["kWh", "Unit1", "Unit2", "Unit3"];
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
}: {
  t: TFunction;
  register: Function;
  errors: Record<string, any>;
  prefix: string;
}) {
  return (
    <TabPanel px={0.5}>
      <HStack spacing={4} mb={12} className="items-start">
        <FormControl isInvalid={!!errors[prefix + "ActivityDataAmount"]}>
          <FormLabel>
            {t("activity-data-amount")}{" "}
            <Tooltip
              hasArrow
              label={t("value-types-tooltip")}
              placement="bottom-start"
            >
              <InfoOutlineIcon mt={-0.5} color="contentTertiary" />
            </Tooltip>
          </FormLabel>
          <InputGroup>
            <NumberInput defaultValue={0} w="full">
              <NumberInputField
                placeholder={t("activity-data-amount-placeholder")}
                borderRightRadius={0}
                {...register(prefix + "ActivityDataAmount", {
                  required: t("activity-data-amount-required"),
                })}
              />
            </NumberInput>
            <InputRightAddon
              className="border-l-2"
              pl={4}
              pr={0}
              bgColor="white"
            >
              <Select
                variant="unstyled"
                {...register(prefix + "ActivityDataUnit")}
              >
                {activityDataUnits.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </Select>
            </InputRightAddon>
          </InputGroup>
          <FormErrorMessage>
            {errors[prefix + "ActivityDataAmount"]?.message}
          </FormErrorMessage>
        </FormControl>
        <FormControl>
          <FormLabel>{t("emission-factor-type")}</FormLabel>
          <Select {...register(prefix + "EmissionFactorType")}>
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
          <InfoOutlineIcon mt={-0.5} color="contentTertiary" />
        </Tooltip>
      </Heading>
      <HStack spacing={4} mb={5}>
        <FormControl>
          <FormLabel color="contentTertiary">
            {t("co2-emission-factor")}
          </FormLabel>
          <InputGroup>
            <NumberInput defaultValue={0} min={0}>
              <NumberInputField
                borderRightRadius={0}
                {...register(prefix + "Co2EmissionFactor")}
                bgColor="backgroundNeutral"
              />
            </NumberInput>
            <InputRightAddon
              bgColor="backgroundNeutral"
              color="contentTertiary"
            >
              CO2/kWh
            </InputRightAddon>
          </InputGroup>
          <FormHelperText>&nbsp;</FormHelperText>
        </FormControl>
        <FormControl>
          <FormLabel color="contentTertiary">
            {t("n2o-emission-factor")}
          </FormLabel>
          <InputGroup>
            <NumberInput defaultValue={0} min={0}>
              <NumberInputField
                borderRightRadius={0}
                {...register(prefix + "N2oEmissionFactor")}
                bgColor="backgroundNeutral"
              />
            </NumberInput>
            <InputRightAddon
              bgColor="backgroundNeutral"
              color="contentTertiary"
            >
              N2O/kWh
            </InputRightAddon>
          </InputGroup>
          <FormHelperText color="contentTertiary">
            {t("optional")}
          </FormHelperText>
        </FormControl>
        <FormControl>
          <FormLabel color="contentTertiary">
            {t("ch4-emission-factor")}
          </FormLabel>
          <InputGroup>
            <NumberInput defaultValue={0} min={0}>
              <NumberInputField
                borderRightRadius={0}
                {...register(prefix + "Ch4EmissionFactor")}
                bgColor="backgroundNeutral"
              />
            </NumberInput>
            <InputRightAddon
              bgColor="backgroundNeutral"
              color="contentTertiary"
            >
              CH4/kWh
            </InputRightAddon>
          </InputGroup>
          <FormHelperText color="contentTertiary">
            {t("optional")}
          </FormHelperText>
        </FormControl>
      </HStack>
      <HStack className="items-start" mb={5}>
        <InfoOutlineIcon mt={1} color="contentLink" />
        <Text color="contentTertiary">{t("emissions-factor-details")}</Text>
      </HStack>
      <FormControl isInvalid={!!errors[prefix + "SourceReference"]} mb={12}>
        <FormLabel>{t("source-reference")}</FormLabel>
        <Textarea
          placeholder={t("source-reference-placeholder")}
          {...register(prefix + "SourceReference", {
            required: t("source-reference-required"),
          })}
        />
        <FormErrorMessage>
          {errors[prefix + "SourceReference"]?.message}
        </FormErrorMessage>
      </FormControl>
      <HStack className="items-start" mb={13}>
        <InfoOutlineIcon mt={1} color="contentLink" />
        <Text color="contentTertiary">
          <Trans
            t={t}
            i18nKey="calculations-details"
            values={{ gwpValue: 1337 }}
          >
            All calculations consider a <b>GWP value of X</b>.
          </Trans>
        </Text>
      </HStack>
    </TabPanel>
  );
}
