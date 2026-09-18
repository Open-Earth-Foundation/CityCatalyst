import HeadingText from "@/components/heading-text";
import {
  Box,
  Button,
  Icon,
  RadioGroupRoot,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC, useEffect } from "react";
import { useController, useForm } from "react-hook-form";
import { api } from "@/services/api";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { MdWarning } from "react-icons/md";
import {
  toCanonical,
  type NotationKeyCanonical,
} from "@/util/notation-keys";

interface ScopeUnavailableProps {
  t: TFunction;
  inventoryId: string;
  subSectorId: string;
  gpcReferenceNumber: string;
  onSubmit: () => void;
  reason?: string;
  justification?: string;
}

const ScopeUnavailable: FC<ScopeUnavailableProps> = ({
  t,
  inventoryId,
  subSectorId,
  gpcReferenceNumber,
  onSubmit,
  reason,
  justification,
}) => {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<{
    reason: string;
    justification: string;
  }>({
    defaultValues: {
      reason: reason ? (toCanonical(reason) ?? reason) : reason,
      justification: justification,
    },
  });

  const [markAsUnavailable, { isLoading }] =
    api.useUpdateOrCreateInventoryValueMutation();

  useController({
    name: "reason",
    control,
    defaultValue: reason,
    rules: { required: t("option-required") },
  });

  const [selectedReason, setSelectedReason] = React.useState<string>();

  useEffect(() => {
    if (reason) {
      const canonical = toCanonical(reason) ?? reason;
      setSelectedReason(canonical);
      setValue("reason", canonical);
    }
  }, [reason, setSelectedReason, setValue]);

  const handleSelectedValue = (value: string) => {
    setSelectedReason(value);
    setValue("reason", value);
  };

  const formSubmitHandler = async (data: {
    reason: string;
    justification: string;
  }) => {
    const unavailableReason =
      toCanonical(data.reason) ?? (data.reason as NotationKeyCanonical);
    await markAsUnavailable({
      inventoryId: inventoryId,
      subSectorId: subSectorId,
      data: {
        unavailableReason,
        unavailableExplanation: data.justification,
        gpcReferenceNumber: gpcReferenceNumber,
      },
    });

    onSubmit();
  };

  const submit = () => {
    handleSubmit(formSubmitHandler)();
  };

  return (
    <Box bg="base.light" borderRadius="8px" p="24px">
      <HeadingText title={t("scope-unavailable")} />
      <Text
        letterSpacing="wide"
        fontSize="body.lg"
        fontWeight="normal"
        color="interactive.control"
        mt="8px"
      >
        {t("scope-unavailable-description")}
      </Text>
      <Box mt="48px">
        <Text
          fontWeight="bold"
          fontSize="title.md"
          fontFamily="heading"
          pt="48px"
          pb="24px"
        >
          {t("select-reason")}
        </Text>
        <RadioGroupRoot>
          <RadioGroup
            value={selectedReason as string}
            onValueChange={(e) => handleSelectedValue(e.value || "")}
            colorPalette="interactive.secondary"
          >
            <Stack direction="column">
              {(
                [
                  ["no-occurrance", "reason-NO"],
                  ["not-estimated", "reason-NE"],
                  ["confidential-information", "reason-C"],
                  ["included-elsewhere", "reason-IE"],
                ] as const
              ).map(([value, labelKey]) => (
                <Radio
                  value={value}
                  key={value}
                  color="content.secondary"
                >
                  {t(labelKey)}
                </Radio>
              ))}

              {errors?.reason ? (
                <Box display="flex" gap="6px" alignItems="center" mt="6px">
                  <Icon as={MdWarning} color="sentiment.negativeDefault" />
                  <Text fontSize="body.md">{errors?.reason.message} </Text>
                </Box>
              ) : null}
            </Stack>
          </RadioGroup>
        </RadioGroupRoot>
        <Text
          fontWeight="medium"
          fontSize="title.md"
          fontFamily="heading"
          pt="48px"
          pb="24px"
          letterSpacing="wide"
        >
          {t("explanation-justification")}
        </Text>
        <Textarea
          borderRadius="4px"
          borderWidth="1px"
          borderColor="border.neutral"
          backgroundColor="base.light"
          placeholder={t("textarea-placeholder-text")}
          {...register("justification", { required: t("value-required") })}
        />
        {errors?.justification ? (
          <Box display="flex" gap="6px" alignItems="center" mt="6px">
            <Icon as={MdWarning} color="sentiment.negativeDefault" />
            <Text fontSize="body.md">{errors?.justification.message} </Text>
          </Box>
        ) : null}
        <Button
          h="48px"
          p="16px"
          mt="24px"
          onClick={submit}
          loading={isLoading}
        >
          {t("save-changes")}
        </Button>
      </Box>
    </Box>
  );
};

export default ScopeUnavailable;
