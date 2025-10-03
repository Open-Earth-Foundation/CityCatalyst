import {
  Box,
  HStack,
  Icon,
  Text,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import {
  Control,
  Controller,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import { resolve } from "@/util/helpers";
import FormattedNumberInput from "@/components/formatted-number-input";
import { EmissionFactorTypes } from "@/hooks/activity-value-form/use-emission-factors";
import { Field } from "@/components/ui/field";
import { MdWarning } from "react-icons/md";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";
import { BodyMedium } from "@/components/package/Texts/Body";

interface ActivityDataSectionProps {
  t: TFunction;
  register: UseFormRegister<any>;
  control: Control<any, any>;
  errors: Record<string, any>;
  setValue: UseFormSetValue<any>;
  title: string;
  units?: string[];
  hideEmissionFactors?: boolean;
  emissionsFactorTypes: EmissionFactorTypes[];
  isDirectMeasure: boolean;
}

export const ActivityDataSection = ({
  t,
  register,
  control,
  errors,
  setValue,
  title,
  units,
  hideEmissionFactors,
  emissionsFactorTypes,
  isDirectMeasure,
}: ActivityDataSectionProps) => {
  const prefix = "";

  if (isDirectMeasure || !title) {
    return null;
  }

  return (
    <Box
      display="flex"
      justifyContent="space-between"
      gap="16px"
      w="full"
    >
      <Field
        invalid={!!resolve(prefix + "activityDataAmount", errors)}
        label={<Text truncate>{t(title)}</Text>}
        flex="2"
      >
        <HStack>
          <FormattedNumberInput
            control={control}
            name={`activity.${title}`}
            defaultValue="0"
            t={t}
            miniAddon
            minWidth="300px"
            flex={2}
          />
          {(units?.length as number) > 0 && (
            <Controller
              rules={{ required: t("option-required") }}
              defaultValue=""
              control={control}
              name={`activity.${title}-unit` as any}
              render={({ field }) => (
                <NativeSelectRoot
                  {...field}
                  borderRadius="4px"
                  borderWidth={
                    errors?.activity?.[`${title}-unit`] ? "1px" : 0
                  }
                  border="inputBox"
                  h="42px"
                  shadow="1dp"
                  borderColor={
                    errors?.activity?.[`${title}-unit`]
                      ? "sentiment.negativeDefault"
                      : ""
                  }
                  background={
                    errors?.activity?.[`${title}-unit`]
                      ? "sentiment.negativeOverlay"
                      : ""
                  }
                  _focus={{
                    borderWidth: "1px",
                    shadow: "none",
                    borderColor: "content.link",
                  }}
                  bgColor="base.light"
                  onChange={(e: any) => {
                    field.onChange(e.target.value);
                    setValue(
                      `activity.${title}-unit` as any,
                      e.target.value,
                    );
                  }}
                >
                  <NativeSelectField
                    placeholder={t("select-unit")}
                    defaultValue={field.value}
                  >
                    {units?.map((item: string) => (
                      <option key={item} value={item}>
                        {t(item)}
                      </option>
                    ))}
                  </NativeSelectField>
                </NativeSelectRoot>
              )}
            />
          )}
        </HStack>

        {errors?.activity?.[title] && (
          <Box display="flex" gap="6px" alignItems="center" mt="6px">
            <Icon as={MdWarning} color="sentiment.negativeDefault" />
            <BodyMedium>
              {t(errors?.activity?.[title]?.message as string)}
            </BodyMedium>
          </Box>
        )}
        {errors?.activity?.[`${title}-unit`] && !errors?.activity?.[title] && (
          <Box display="flex" gap="6px" alignItems="center" mt="6px">
            <Icon as={MdWarning} color="sentiment.negativeDefault" />
            <BodyMedium>
              {errors?.activity?.[`${title}-unit`]?.message}
            </BodyMedium>
          </Box>
        )}
      </Field>

      {!hideEmissionFactors && (
        <Field
          label={t("emission-factor-type")}
          invalid={!!resolve(prefix + "emissionFactorType", errors)}
          maxWidth="250px"
          flex="1"
          truncateLabel
        >
          <Controller
            name="activity.emissionFactorType"
            control={control}
            render={({ field }) => (
              <NativeSelectRoot
                borderRadius="4px"
                borderWidth={
                  errors?.activity?.emissionFactorType ? "1px" : 0
                }
                border="inputBox"
                h="42px"
                shadow="1dp"
                borderColor={
                  errors?.activity?.emissionFactorType
                    ? "sentiment.negativeDefault"
                    : ""
                }
                background={
                  errors?.activity?.emissionFactorType
                    ? "sentiment.negativeOverlay"
                    : ""
                }
                _focus={{
                  borderWidth: "1px",
                  shadow: "none",
                  borderColor: "content.link",
                }}
                bgColor="base.light"
                {...register("activity.emissionFactorType", {
                  required: t("option-required"),
                })}
              >
                <NativeSelectField
                  value={field.value}
                  placeholder={t("emissions-factor-type-placeholder")}
                  onChange={(e: any) => {
                    field.onChange(e.target.value);
                    setValue(
                      "activity.emissionFactorType",
                      e.target.value,
                    );
                  }}
                >
                  {emissionsFactorTypes.map(({ id, name }) => (
                    <option key={id} value={id}>
                      {t(name)}
                    </option>
                  ))}
                  <option key="custom" value="custom">
                    {t("add-custom")}
                  </option>
                </NativeSelectField>
              </NativeSelectRoot>
            )}
          />

          {errors.activity?.emissionFactorType ? (
            <Box display="flex" gap="6px" alignItems="center" mt="6px">
              <Icon as={MdWarning} color="sentiment.negativeDefault" />
              <BodyMedium>
                {t("emission-factor-form-label")}
              </BodyMedium>
            </Box>
          ) : (
            <Box
              display="flex"
              gap="6px"
              alignItems="center"
              mt="6px"
            />
          )}
        </Field>
      )}
    </Box>
  );
};