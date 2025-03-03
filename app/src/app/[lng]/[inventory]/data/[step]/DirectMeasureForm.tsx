import {
  Box,
  HStack,
  Heading,
  Group,
  InputAddon,
  Select,
  Textarea,
  Icon,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { resolve } from "@/util/helpers";
import { Tooltip } from "@/components/ui/tooltip";
import {
  NumberInputRoot,
  NumberInputField,
} from "@/components/ui/number-input";
import { MdOutlineInfo } from "react-icons/md";
import { Field } from "@/components/ui/field";

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
          showArrow
          content={t("value-types-tooltip")}
          positioning={{ placement: "bottom-start" }}
        >
          <Icon as={MdOutlineInfo} mt={-0.5} color="content.tertiary" />
        </Tooltip>
      </Heading>
      <HStack spaceX={4} spaceY={4} mb={12} className="items-start">
        <Field
          invalid={!!resolve(prefix + "co2Emissions", errors)}
          errorText={resolve(prefix + "co2Emissions", errors)?.message}
          label={t("co2-emissions-value")}
          labelColor="content.tertiary"
        >
          <Group attached>
            <NumberInputRoot defaultValue="0">
              <NumberInputField
                borderRightRadius={0}
                bgColor="base.light"
                {...register(prefix + "co2Emissions", {
                  required: t("value-required"),
                })}
              />
            </NumberInputRoot>
            <InputAddon bgColor="base.light" color="content.tertiary">
              tCO2
            </InputAddon>
          </Group>
        </Field>
        <Field
          invalid={!!resolve(prefix + "ch4Emissions", errors)}
          label={t("ch4-emissions-value")}
          errorText={resolve(prefix + "ch4Emissions", errors)?.message}
        >
          <Group attached>
            <NumberInputRoot defaultValue="0">
              <NumberInputField
                borderRightRadius={0}
                bgColor="base.light"
                {...register(prefix + "ch4Emissions", {
                  required: t("value-required"),
                })}
              />
            </NumberInputRoot>
            <InputAddon bgColor="base.light" color="content.tertiary">
              tCH4
            </InputAddon>
          </Group>
        </Field>
        <Field
          label={t("n2o-emissions-value")}
          invalid={!!resolve(prefix + "n2oEmissions", errors)}
          errorText={resolve(prefix + "n2oEmissions", errors)?.message}
        >
          <Group attached>
            <NumberInputRoot defaultValue="0">
              <NumberInputField
                borderRightRadius={0}
                bgColor="base.light"
                {...register(prefix + "n2oEmissions", {
                  required: t("value-required"),
                })}
              />
            </NumberInputRoot>
            <InputAddon bgColor="base.light" color="content.tertiary">
              tN2O
            </InputAddon>
          </Group>
        </Field>
      </HStack>
      <Field
        invalid={!!resolve(prefix + "dataQuality", errors)}
        label={t("data-quality")}
        mb={12}
        errorText={resolve(prefix + "dataQuality", errors)?.message}
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
        invalid={!!resolve(prefix + "sourceReference", errors)}
        label={t("source-reference")}
        errorText={resolve(prefix + "sourceReference", errors)?.message}
      >
        <Textarea
          placeholder={t("source-reference-placeholder")}
          bgColor="base.light"
          {...register(prefix + "sourceReference", {
            required: t("source-reference-required"),
          })}
        />
      </Field>
    </Box>
  );
}
