import { Box, Text } from "@chakra-ui/react";
import { Trans } from "react-i18next";
import {
  ManualInputValidationErrorCodes,
  ManualValidationErrorDetails,
} from "@/lib/custom-errors/manual-input-error";
import { TFunction } from "i18next";
import { UseFormSetError, UseFormSetFocus } from "react-hook-form";
import { Inputs } from "@/components/Modals/activity-modal/activity-modal-body";
import { toaster } from "@/components/ui/toaster";

const useActivityValueValidation = ({
  t,
  setError,
  setFocus,
}: {
  t: TFunction;
  setError: UseFormSetError<Inputs>;
  setFocus: UseFormSetFocus<Inputs>;
}) => {
  const handleManalInputValidationError = (
    error: ManualValidationErrorDetails,
  ) => {
    const { code, meta, targetFields } = error;
    targetFields.forEach((field) => {
      setError(`activity.${field}` as any, {
        type: "manual-input-validation",
        message: "manual-input-validation",
      });
      setFocus(`activity.${field}` as any);
    });
    let desciptionValues = null;
    let key = "";
    switch (code) {
      case ManualInputValidationErrorCodes.EXCLUSIVE_CONFLICT_SECONDARY:
        key = "manual-input-error-exclusive-secondary";
        desciptionValues = {
          targetField: t(targetFields[0]),
          exclusiveFieldValue: t(meta?.exclusiveFieldValue as string),
        };
        targetFields.forEach((field) => {
          setError(`activity.${field}` as any, {
            type: "manual-input-validation",
            message: t("manual-input-error-exclusive-secondary-inline"),
          });
          setFocus(`activity.${field}` as any);
        });
        break;
      case ManualInputValidationErrorCodes.EXCLUSIVE_CONFLICT:
        key = "manual-input-error-exclusive";
        desciptionValues = {
          targetField: t(targetFields[0]),
          exclusiveFieldValue: t(meta?.exclusiveFieldValue as string),
        };
        targetFields.forEach((field) => {
          setError(`activity.${field}` as any, {
            type: "manual-input-validation",
            message: t("manual-input-error-exclusive-inline", {
              value: t(meta?.exclusiveFieldValue as string),
            }),
          });
          setFocus(`activity.${field}` as any);
        });
        break;
      case ManualInputValidationErrorCodes.UNIQUE_BY_CONFLICT:
        key = "manual-input-error-unique";
        desciptionValues = {
          targetField: targetFields
            .map((f) => (f.includes("-source") ? t("data-source") : t(f)))
            .join(", "),
        };
        targetFields.forEach((field) => {
          setError(`activity.${field}` as any, {
            type: "manual-input-validation",
            message: t("manual-input-error-unique-inline"),
          });
          setFocus(`activity.${field}` as any);
        });
        break;
      case ManualInputValidationErrorCodes.REQUIRED_FIELD_MISSING:
        key = "manual-input-error-required";
      default:
        break;
    }
    toaster.error({
      duration: 6000,
      meta: { closable: true },
      title: (
        <Trans t={t} values={desciptionValues ?? {}}>
          {key}
        </Trans>
      ),
    });
  };

  return { handleManalInputValidationError };
};

export default useActivityValueValidation;
