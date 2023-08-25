import { InfoOutlineIcon } from "@chakra-ui/icons";
import {
  Box,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  Heading,
  InputGroup,
  InputRightAddon,
  NumberInput,
  NumberInputField,
  Tooltip,
} from "@chakra-ui/react";
import { TFunction } from "i18next";

export function DirectMeasureForm({
  t,
  register,
  errors,
  className,
}: {
  t: TFunction;
  register: Function;
  errors: Record<string, any>;
  className?: string;
}) {
  return (
    <Box className={className}>
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
            {t("co2-emissions-value")}
          </FormLabel>
          <InputGroup>
            <NumberInput defaultValue={0} min={0}>
              <NumberInputField
                borderRightRadius={0}
                {...register("directCo2Emissions")}
                bgColor="backgroundNeutral"
              />
            </NumberInput>
            <InputRightAddon
              bgColor="backgroundNeutral"
              color="contentTertiary"
            >
              tCO2e
            </InputRightAddon>
          </InputGroup>
          <FormHelperText>&nbsp;</FormHelperText>
        </FormControl>
        <FormControl>
          <FormLabel color="contentTertiary">
            {t("ch4-emissions-value")}
          </FormLabel>
          <InputGroup>
            <NumberInput defaultValue={0} min={0}>
              <NumberInputField
                borderRightRadius={0}
                {...register("directCh4Emissions")}
                bgColor="backgroundNeutral"
              />
            </NumberInput>
            <InputRightAddon
              bgColor="backgroundNeutral"
              color="contentTertiary"
            >
              tCH4e
            </InputRightAddon>
          </InputGroup>
          <FormHelperText color="contentTertiary">
            {t("optional")}
          </FormHelperText>
        </FormControl>
        <FormControl>
          <FormLabel color="contentTertiary">
            {t("n2o-emissions-value")}
          </FormLabel>
          <InputGroup>
            <NumberInput defaultValue={0} min={0}>
              <NumberInputField
                borderRightRadius={0}
                {...register("directN2oEmissions")}
                bgColor="backgroundNeutral"
              />
            </NumberInput>
            <InputRightAddon
              bgColor="backgroundNeutral"
              color="contentTertiary"
            >
              tN2Oe
            </InputRightAddon>
          </InputGroup>
          <FormHelperText color="contentTertiary">
            {t("optional")}
          </FormHelperText>
        </FormControl>
      </HStack>
    </Box>
  );
}
