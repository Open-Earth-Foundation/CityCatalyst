import {
  Box,
  HStack,
  Icon,
  Input,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import {
  Control,
  Controller,
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
import { BodyMedium } from "@/components/Texts/Body";

interface DataQualitySectionProps {
  t: TFunction;
  register: UseFormRegister<any>;
  control: Control<any, any>;
  errors: Record<string, any>;
  setValue: UseFormSetValue<any>;
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
                {...register("activity.dataQuality", {
                  required: t("option-required"),
                })}
                h="full"
                shadow="1dp"
              >
                <NativeSelectField
                  placeholder={t("data-quality-placeholder")}
                  value={field.value}
                  onChange={(e: any) => {
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
          {errors.activity?.dataQuality && (
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
              borderWidth={errors?.activity?.[sourceField.id] ? "1px" : 0}
              border="inputBox"
              borderColor={
                errors?.activity?.[sourceField.id]
                  ? "sentiment.negativeDefault"
                  : ""
              }
              background={
                errors?.activity?.[sourceField.id]
                  ? "sentiment.negativeOverlay"
                  : ""
              }
              bgColor="base.light"
              _focus={{
                borderWidth: "1px",
                shadow: "none",
                borderColor: "content.link",
              }}
              {...register(`activity.${sourceField.id}` as any, {
                required:
                  sourceField.required === false
                    ? false
                    : t("value-required"),
              })}
            />

            {errors?.activity?.[sourceField.id] && (
              <Box display="flex" gap="6px" alignItems="center" mt="6px">
                <Icon as={MdWarning} color="sentiment.negativeDefault" />
                <Text fontSize="body.md">
                  {errors?.activity?.[sourceField.id]?.message}
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
            borderWidth={errors?.activity?.dataComments ? "1px" : 0}
            border="inputBox"
            borderRadius="4px"
            shadow="1dp"
            h="96px"
            borderColor={
              errors?.activity?.dataComments
                ? "sentiment.negativeDefault"
                : ""
            }
            background={
              errors?.activity?.dataComments
                ? "sentiment.negativeOverlay"
                : ""
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
          {errors.activity?.dataComments && (
            <Box display="flex" gap="6px" alignItems="center" mt="6px">
              <Icon as={MdWarning} color="sentiment.negativeDefault" />
              <BodyMedium fontSize="body.md">
                {errors?.activity?.dataComments?.message}
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