import { RadioButton } from "@/components/radio-button";
import {
  Box,
  Heading,
  HStack,
  Icon,
  Select,
  Textarea,
  useRadioGroup,
} from "@chakra-ui/react";
import { ActivityDataTab } from "./ActivityDataTab";
import { DirectMeasureForm } from "./DirectMeasureForm";
import type { TFunction } from "i18next";
import { Control, useController } from "react-hook-form";
import { resolve } from "@/util/helpers";
import type { EmissionsFactorWithDataSources } from "@/util/types";
import { MdInfoOutline } from "react-icons/md";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";

export function EmissionsForm({
  t,
  register,
  errors,
  control,
  prefix = "",
  watch,
  setValue,
  gpcReferenceNumber,
  emissionsFactors,
}: {
  t: TFunction;
  register: Function;
  errors: Record<string, any>;
  control: Control<any, any>;
  prefix?: string;
  watch: Function;
  setValue: Function;
  gpcReferenceNumber: string;
  emissionsFactors: EmissionsFactorWithDataSources[];
}) {
  const { field } = useController({
    name: prefix + "methodology",
    control,
    defaultValue: "",
  });
  const {
    getRootProps,
    getItemProps,
    value: methodology,
  } = useRadioGroup(field);

  const isUnavailable = watch(prefix + "isUnavailable");

  return (
    <Box className="space-y-6">
      <Field label={t("unavailable-not-applicable")}>
        <Switch size="lg" {...register(prefix + "isUnavailable")} />
      </Field>
      {isUnavailable ? (
        <>
          <Field
            mb={12}
            mt={2}
            label={t("unavailable-reason")}
            invalid={!!resolve(prefix + "unavailableReason", errors)}
            errorText={resolve(prefix + "unavailableReason", errors)?.message}
          >
            <Select.Root
              bgColor="base.light"
              placeholder={t("unavailable-reason-placeholder")}
              {...register(prefix + "unavailableReason", {
                required: t("option-required"),
              })}
            >
              <option value="no-occurrance">{t("no-occurrance")}</option>
              <option value="not-estimated">{t("not-estimated")}</option>
              <option value="confidential-information">
                {t("confidential-information")}
              </option>
              <option value="presented-elsewhere">
                {t("presented-elsewhere")}
              </option>
            </Select.Root>
          </Field>

          <Field
            label={t("unavailable-explanation")}
            invalid={!!resolve(prefix + "unavailableExplanation", errors)}
            errorText={
              resolve(prefix + "unavailableExplanation", errors)?.message
            }
          >
            <Textarea
              placeholder={t("unavailable-explanation-placeholder")}
              bgColor="base.light"
              {...register(prefix + "unavailableExplanation", {
                required: t("unavailable-explanation-required"),
              })}
            />
          </Field>
        </>
      ) : (
        <>
          <Heading size="sm" className="font-normal">
            {t("select-methodology")}{" "}
            <Tooltip
              showArrow
              content={t("methodology-tooltip")}
              contentProps={{
                css: {
                  "--tooltip-bg": "content.secondary",
                  "--tooltip-text": "base.light",
                },
              }}
              positioning={{ placement: "bottom-start" }}
            >
              <Icon as={MdInfoOutline} mt={-0.5} color="content.tertiary" />
            </Tooltip>
          </Heading>
          <HStack spaceX={4} spaceY={4} {...getRootProps()}>
            <RadioButton {...getItemProps({ value: "activity-data" })}>
              {t("activity-data")}
            </RadioButton>
            <RadioButton {...getItemProps({ value: "direct-measure" })}>
              {t("direct-measure")}
            </RadioButton>
          </HStack>
          {/*** Activity data ***/}
          {methodology === "activity-data" && (
            <ActivityDataTab
              t={t}
              register={register}
              errors={errors}
              prefix={prefix + "activity."}
              watch={watch}
              setValue={setValue}
              gpcReferenceNumber={gpcReferenceNumber}
              emissionsFactors={emissionsFactors}
            />
          )}
          {/*** Direct measure ***/}
          {methodology === "direct-measure" && (
            <DirectMeasureForm
              t={t}
              register={register}
              errors={errors}
              prefix={prefix + "direct."}
            />
          )}
        </>
      )}
    </Box>
  );
}
