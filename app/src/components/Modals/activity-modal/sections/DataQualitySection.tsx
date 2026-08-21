import { Box, HStack, Icon, Input, Text, Textarea } from "@chakra-ui/react";
import { TFunction } from "i18next";
import React from "react";
import {
  Control,
  Controller,
  FieldErrors,
  FieldValues,
  Path,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import { resolve } from "@/util/helpers";
import { ExtraField } from "@/util/form-schema";
import { Field } from "@/components/ui/field";
import { MdInfoOutline, MdWarning } from "react-icons/md";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";
import { BodyMedium } from "@/components/package/Texts/Body";
import { Inputs } from "../activity-modal-body";

interface DataQualitySectionProps {
  t: TFunction;
  register: UseFormRegister<Inputs>;
  control: Control<FieldValues>;
  errors: FieldErrors<FieldValues>;
  setValue: UseFormSetValue<Inputs>;
  fields: ExtraField[];
}

export const DataQualitySection = ({
  t,
  register,
  control,
  errors,
  setValue,
  fields,
}: DataQualitySectionProps) => {
  const prefix = "";

  const sourceField = fields.find(
    (f) => f.id.includes("-source") && f.type === "text",
  );

  const activityErrors = errors?.activity as
    | Record<string, { message?: string } | undefined>
    | undefined;

  return (
    <>
      <HStack display="flex" flexDirection="column" mt={4} gap={4} mb={5}>
        <Field
          invalid={!!resolve(prefix + "dataQuality", errors)}
          label={t("data-quality")}
        >
          <Controller
            name="activity.dataQuality"
            control={control}
            render={({ field }) => (
              <NativeSelectRoot
                borderWidth={activityErrors?.dataQuality ? "1px" : 0}
                border="inputBox"
                borderRadius="4px"
                borderColor={
                  activityErrors?.dataQuality
                    ? "sentiment.negativeDefault"
                    : ""
                }
                background={
                  activityErrors?.dataQuality
                    ? "sentiment.negativeOverlay"
                    : ""
                }
                _focus={{
                  borderWidth: "1px",
                  shadow: "none",
                  borderColor: "content.link",
                }}
                bgColor="base.light"
                {...register("activity.dataQuality", {
                  required: t("option-required"),
                })}
                h="full"
                shadow="1dp"
              >
                <NativeSelectField
                  aria-label={t("data-quality")}
                  placeholder={t("data-quality-placeholder")}
                  value={field.value}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    field.onChange(e.target.value);
                    setValue("activity.dataQuality", e.target.value);
                  }}
                >
                  <option value="high">{t("detailed-activity-data")}</option>
                  <option value="medium">{t("modeled-activity-data")}</option>
                  <option value="low">
                    {t("highly-modeled-uncertain-activity-data")}
                  </option>
                </NativeSelectField>
              </NativeSelectRoot>
            )}
          />
          {activityErrors?.dataQuality && (
            <Box display="flex" gap="6px" alignItems="center" mt="6px">
              <Icon as={MdWarning} color="sentiment.negativeDefault" />
              <Text fontSize="body.md">{t("data-quality-form-label")}</Text>
            </Box>
          )}
        </Field>

        {sourceField && (
          <Field w="full" label={t("data-source")}>
            <Input
              type="text"
              borderRadius="4px"
              placeholder={t("data-source-placeholder")}
              h="48px"
              shadow="1dp"
              borderWidth={activityErrors?.[sourceField.id] ? "1px" : 0}
              border="inputBox"
              borderColor={
                activityErrors?.[sourceField.id]
                  ? "sentiment.negativeDefault"
                  : ""
              }
              background={
                activityErrors?.[sourceField.id]
                  ? "sentiment.negativeOverlay"
                  : ""
              }
              bgColor="base.light"
              _focus={{
                borderWidth: "1px",
                shadow: "none",
                borderColor: "content.link",
              }}
              {...register(`activity.${sourceField.id}` as Path<Inputs>, {
                required:
                  sourceField.required === false ? false : t("value-required"),
              })}
            />

            {activityErrors?.[sourceField.id] && (
              <Box display="flex" gap="6px" alignItems="center" mt="6px">
                <Icon as={MdWarning} color="sentiment.negativeDefault" />
                <Text fontSize="body.md">
                  {activityErrors?.[sourceField.id]?.message}
                </Text>
              </Box>
            )}
          </Field>
        )}

        <Field
          invalid={!!resolve(prefix + "dataComments", errors)}
          mb={12}
          label={t("data-comments")}
        >
          <Textarea
            data-testid="source-reference"
            borderWidth={activityErrors?.dataComments ? "1px" : 0}
            border="inputBox"
            borderRadius="4px"
            shadow="1dp"
            h="96px"
            borderColor={
              activityErrors?.dataComments ? "sentiment.negativeDefault" : ""
            }
            background={
              activityErrors?.dataComments ? "sentiment.negativeOverlay" : ""
            }
            _focus={{
              borderWidth: "1px",
              shadow: "none",
              borderColor: "content.link",
            }}
            placeholder={t("data-comments-placeholder")}
            {...register(`activity.dataComments`, {
              required: t("data-comments-required"),
            })}
          />
          {activityErrors?.dataComments && (
            <Box display="flex" gap="6px" alignItems="center" mt="6px">
              <Icon as={MdWarning} color="sentiment.negativeDefault" />
              <BodyMedium fontSize="body.md">
                {activityErrors?.dataComments?.message}
              </BodyMedium>
            </Box>
          )}
        </Field>
      </HStack>

      <HStack alignItems="flex-start" mb={13}>
        <Icon as={MdInfoOutline} mt={1} color="content.link" />
        <Text color="content.tertiary">
          {t("gwp-info-prefix")}{" "}
          <Text as="span" fontWeight="bold">
            {t("gwp-info")}
          </Text>
        </Text>
      </HStack>
    </>
  );
};
