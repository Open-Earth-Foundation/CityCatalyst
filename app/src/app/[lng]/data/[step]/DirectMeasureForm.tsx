import { InfoOutlineIcon } from "@chakra-ui/icons";
import {
  Box,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  Heading,
  InputGroup,
  InputRightAddon,
  NumberInput,
  NumberInputField,
  Select,
  Textarea,
  Tooltip,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { resolve } from "@/util/helpers";

export function DirectMeasureForm({
  t,
  register,
  errors,
  className,
  prefix = "",
}: {
  t: TFunction;
  register: Function;
  errors: Record<string, any>;
  className?: string;
  prefix?: string;
}) {
  return (
    <Box className={className} pl={0.5}>
      <Heading size="sm" mb={4} className="font-normal">
        {t("emissions-values")}{" "}
        <Tooltip
          hasArrow
          label={t("value-types-tooltip")}
          placement="bottom-start"
        >
          <InfoOutlineIcon mt={-0.5} color="content.tertiary" />
        </Tooltip>
      </Heading>
      <HStack spacing={4} mb={12} className="items-start">
        <FormControl isInvalid={!!resolve(prefix + "co2Emissions", errors)}>
          <FormLabel color="content.tertiary">
            {t("co2-emissions-value")}
          </FormLabel>
          <InputGroup>
            <NumberInput defaultValue={0}>
              <NumberInputField
                borderRightRadius={0}
                bgColor="base.light"
                {...register(prefix + "co2Emissions", {
                  required: t("value-required"),
                })}
              />
            </NumberInput>
            <InputRightAddon bgColor="base.light" color="content.tertiary">
              tCO2
            </InputRightAddon>
          </InputGroup>
          <FormErrorMessage>
            {resolve(prefix + "co2Emissions", errors)?.message}
          </FormErrorMessage>
        </FormControl>
        <FormControl isInvalid={!!resolve(prefix + "ch4Emissions", errors)}>
          <FormLabel color="content.tertiary">
            {t("ch4-emissions-value")}
          </FormLabel>
          <InputGroup>
            <NumberInput defaultValue={0}>
              <NumberInputField
                borderRightRadius={0}
                bgColor="base.light"
                {...register(prefix + "ch4Emissions", {
                  required: t("value-required"),
                })}
              />
            </NumberInput>
            <InputRightAddon bgColor="base.light" color="content.tertiary">
              tCH4
            </InputRightAddon>
          </InputGroup>
          <FormErrorMessage>
            {resolve(prefix + "ch4Emissions", errors)?.message}
          </FormErrorMessage>
        </FormControl>
        <FormControl isInvalid={!!resolve(prefix + "n2oEmissions", errors)}>
          <FormLabel color="content.tertiary">
            {t("n2o-emissions-value")}
          </FormLabel>
          <InputGroup>
            <NumberInput defaultValue={0}>
              <NumberInputField
                borderRightRadius={0}
                bgColor="base.light"
                {...register(prefix + "n2oEmissions", {
                  required: t("value-required"),
                })}
              />
            </NumberInput>
            <InputRightAddon bgColor="base.light" color="content.tertiary">
              tN2O
            </InputRightAddon>
          </InputGroup>
          <FormErrorMessage>
            {resolve(prefix + "n2oEmissions", errors)?.message}
          </FormErrorMessage>
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
          {...register(prefix + "dataQuality", {
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
      <FormControl isInvalid={!!resolve(prefix + "sourceReference", errors)}>
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
    </Box>
  );
}
