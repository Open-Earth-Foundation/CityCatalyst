import {
  Grid,
  GridItem,
  HStack,
  Icon,
  Input,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { useMemo } from "react";
import {
  Control,
  Controller,
  FieldErrors,
  FieldValues,
  useWatch,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import { getDataYearOptions } from "@/util/data-providers";
import { ProviderCombobox } from "./ProviderCombobox";
import {
  ModalField,
  ModalFieldError,
  ModalSelect,
  modalInputProps,
} from "./ModalField";
import { ExtraField } from "@/util/form-schema";
import { MdInfoOutline } from "react-icons/md";
import { Inputs } from "../activity-modal-body";
import { GlobalWarmingPotentialTypeEnum } from "@/util/enums";

interface DataQualitySectionProps {
  t: TFunction;
  register: UseFormRegister<Inputs>;
  control: Control<FieldValues>;
  errors: FieldErrors<FieldValues>;
  setValue: UseFormSetValue<Inputs>;
  fields: ExtraField[];
  gwp?: {
    version: GlobalWarmingPotentialTypeEnum | string;
    ch4: number | null;
    n2o: number | null;
  } | null;
}

export const DataQualitySection = ({
  t,
  register,
  control,
  errors,
  setValue,
  fields,
  gwp,
}: DataQualitySectionProps) => {
  const sourceField = fields.find(
    (f) => f.id.includes("-source") && f.type === "text",
  );

  const activityErrors = errors?.activity as
    Record<string, { message?: string } | undefined> | undefined;

  const storedYear = Number(useWatch({ control, name: "activity.dataYear" }));
  const yearOptions = useMemo(
    () => getDataYearOptions(storedYear || undefined),
    [storedYear],
  );

  return (
    <>
      <Grid templateColumns="repeat(2, 1fr)" gap={4} mb={5}>
        <GridItem colSpan={2}>
          <ModalField
            label={t("select-data-quality")}
            required
            invalid={!!activityErrors?.dataQuality}
          >
            <Controller
              name="activity.dataQuality"
              control={control}
              rules={{ required: t("option-required") }}
              render={({ field }) => (
                <ModalSelect
                  aria-label={t("data-quality")}
                  placeholder={t("data-quality-placeholder")}
                  invalid={!!activityErrors?.dataQuality}
                  name={field.name}
                  value={field.value ?? ""}
                  onBlur={field.onBlur}
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
                </ModalSelect>
              )}
            />
            {activityErrors?.dataQuality && (
              <ModalFieldError message={t("data-quality-form-label")} />
            )}
          </ModalField>
        </GridItem>

        {sourceField && (
          <ModalField
            label={t("data-provider")}
            required={sourceField.required !== false}
            invalid={!!activityErrors?.[sourceField.id]}
          >
            <Controller
              name={`activity.${sourceField.id}`}
              control={control}
              defaultValue=""
              rules={{
                required:
                  sourceField.required === false ? false : t("value-required"),
              }}
              render={({ field }) => (
                <ProviderCombobox
                  t={t}
                  value={(field.value as string) ?? ""}
                  onChange={field.onChange}
                  invalid={!!activityErrors?.[sourceField.id]}
                />
              )}
            />
            {activityErrors?.[sourceField.id] && (
              <ModalFieldError
                message={activityErrors?.[sourceField.id]?.message}
              />
            )}
          </ModalField>
        )}

        <ModalField
          label={t("data-year")}
          required
          invalid={!!activityErrors?.dataYear}
        >
          <ModalSelect
            aria-label={t("data-year")}
            placeholder={t("data-year-placeholder")}
            invalid={!!activityErrors?.dataYear}
            {...register("activity.dataYear", {
              required: t("option-required"),
            })}
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </ModalSelect>
          {activityErrors?.dataYear && (
            <ModalFieldError message={activityErrors.dataYear.message} />
          )}
        </ModalField>

        <GridItem colSpan={2}>
          <ModalField label={t("source-document")}>
            <Input
              {...modalInputProps(false)}
              placeholder={t("source-document-placeholder")}
              {...register("activity.sourceDocument")}
            />
          </ModalField>
        </GridItem>

        <ModalField label={t("source-page")}>
          <Input
            {...modalInputProps(false)}
            placeholder={t("source-page-placeholder")}
            {...register("activity.sourcePage")}
          />
        </ModalField>
        <ModalField
          label={t("source-url")}
          invalid={!!activityErrors?.sourceUrl}
        >
          <Input
            {...modalInputProps(!!activityErrors?.sourceUrl)}
            type="url"
            placeholder={t("source-url-placeholder")}
            {...register("activity.sourceUrl", {
              pattern: {
                value: /^https?:\/\/\S+$/i,
                message: t("source-url-invalid"),
              },
            })}
          />
          {activityErrors?.sourceUrl && (
            <ModalFieldError message={activityErrors.sourceUrl.message} />
          )}
        </ModalField>

        <GridItem colSpan={2}>
          <ModalField
            invalid={!!activityErrors?.dataComments}
            required
            label={t("data-comments")}
          >
            <Textarea
              data-testid="source-reference"
              {...modalInputProps(!!activityErrors?.dataComments)}
              h="96px"
              placeholder={t("data-comments-placeholder")}
              {...register(`activity.dataComments`, {
                required: t("data-comments-required"),
              })}
            />
            {activityErrors?.dataComments && (
              <ModalFieldError message={activityErrors.dataComments.message} />
            )}
          </ModalField>
        </GridItem>
      </Grid>

      {gwp && gwp.ch4 != null && gwp.n2o != null && (
        <HStack alignItems="flex-start" mb={4}>
          <Icon as={MdInfoOutline} mt={1} color="content.link" />
          <Text color="content.tertiary">
            {t("gwp-info-prefix")}{" "}
            <Text as="span" fontWeight="bold">
              {t("gwp-info", {
                ch4: gwp.ch4,
                n2o: gwp.n2o,
                version: gwp.version.toString().toUpperCase(),
              })}
            </Text>
          </Text>
        </HStack>
      )}
    </>
  );
};
