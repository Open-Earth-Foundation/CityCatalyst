import HeadingText from "@/components/heading-text";
import {
  Box,
  Button,
  Radio,
  RadioGroup,
  Stack,
  Text,
  Textarea,
  useRadioGroup,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC, useEffect } from "react";
import { useController, useForm } from "react-hook-form";
import { api } from "@/services/api";
import { WarningIcon } from "@chakra-ui/icons";

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
    reset,
    watch,
    setError,
    clearErrors,
    setFocus,
    setValue,
    control,
    getValues,
    formState: { errors },
  } = useForm<{
    reason: string;
    justification: string;
  }>({
    defaultValues: {
      reason: reason,
      justification: justification,
    },
  });

  const [markAsUnavailable, { isLoading }] =
    api.useUpdateOrCreateInventoryValueMutation();

  const { field } = useController({
    name: "reason",
    control,
    defaultValue: reason,
    rules: { required: t("option-required") },
  });

  const {
    getRootProps,
    getRadioProps,
    value: selectedReason,
    setValue: setSelectedReason,
  } = useRadioGroup({
    defaultValue: reason || "",
    onChange: (value) => setValue("reason", value), // Update reason in React Hook Form on selection
  });

  useEffect(() => {
    if (reason) {
      setSelectedReason(reason);
      setValue("reason", reason);
    }
  }, [reason, setSelectedReason, setValue]);

  const formSubmitHandler = async (data: {
    reason: string;
    justification: string;
  }) => {
    await markAsUnavailable({
      inventoryId: inventoryId,
      subSectorId: subSectorId,
      data: {
        unavailableReason: data.reason,
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
        <RadioGroup
          value={selectedReason as string}
          onChange={setSelectedReason}
        >
          <Stack direction="column">
            <Radio
              {...getRadioProps({ value: "reason-NO" })}
              key={"reason-NO"}
              color="interactive.secondary"
            >
              {t("reason-NO")}
            </Radio>
            <Radio
              {...getRadioProps({ value: "reason-NE" })}
              key={"reason-NE"}
              color="interactive.secondary"
            >
              {t("reason-NE")}
            </Radio>
            <Radio
              {...getRadioProps({ value: "reason-C" })}
              key={"reason-C"}
              color="interactive.secondary"
            >
              {t("reason-C")}
            </Radio>
            <Radio
              {...getRadioProps({ value: "reason-IE" })}
              key={"reason-IE"}
              color="interactive.secondary"
            >
              {t("reason-IE")}
            </Radio>

            {errors?.reason ? (
              <Box display="flex" gap="6px" alignItems="center" mt="6px">
                <WarningIcon color="sentiment.negativeDefault" />
                <Text fontSize="body.md">{errors?.reason.message} </Text>
              </Box>
            ) : null}
          </Stack>
        </RadioGroup>
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
            <WarningIcon color="sentiment.negativeDefault" />
            <Text fontSize="body.md">{errors?.justification.message} </Text>
          </Box>
        ) : null}
        <Button
          h="48px"
          p="16px"
          mt="24px"
          onClick={submit}
          isLoading={isLoading}
        >
          {t("save-changes")}
        </Button>
      </Box>
    </Box>
  );
};

export default ScopeUnavailable;
