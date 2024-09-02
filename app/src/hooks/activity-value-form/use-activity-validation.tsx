import { useToast, Box, CloseButton, Text } from '@chakra-ui/react';
import { Trans } from 'react-i18next';
import {
  ManualInputValidationErrorCodes,
  ManualValidationErrorDetails,
} from '@/lib/custom-errors.ts/manual-input-error';
import { TFunction } from 'i18next';
import { UseFormSetError, UseFormSetFocus } from 'react-hook-form';
import { Inputs } from '@/components/Modals/activity-modal/activity-modal-body';

const useActivityValueValidation = ({t, setError, setFocus}: {
    t: TFunction,
    setError: UseFormSetError<Inputs>
    setFocus: UseFormSetFocus<Inputs>
}) => {
  const toast = useToast();

  const handleManalInputValidationError = (error: ManualValidationErrorDetails) => {
    const { code, meta, targetFields } = error;
    targetFields.forEach((field) => {
      setError(`activity.${field}` as any, {
        type: 'manual-input-validation',
        message: 'manual-input-validation',
      });
      setFocus(`activity.${field}` as any);
    });
    let desciptionValues = null;
    let key = '';
    switch (code) {
      case ManualInputValidationErrorCodes.EXCLUSIVE_CONFLICT_SECONDARY:
        key = 'manual-input-error-exclusive-secondary';
        desciptionValues = {
          targetField: t(targetFields[0]),
          exclusiveFieldValue: t(meta?.exclusiveFieldValue as string),
        };
        break;
      case ManualInputValidationErrorCodes.EXCLUSIVE_CONFLICT:
        key = 'manual-input-error-exclusive';
        desciptionValues = {
          targetField: t(targetFields[0]),
          exclusiveFieldValue: t(meta?.exclusiveFieldValue as string),
        };
        break;
      case ManualInputValidationErrorCodes.UNIQUE_BY_CONFLICT:
        key = 'manual-input-error-unique';
        desciptionValues = {
          targetField: t(targetFields.join(', ')),
        };
        break;
      case ManualInputValidationErrorCodes.REQUIRED_FIELD_MISSING:
        key = 'manual-input-error-required';
      default:
        break;
    }
    toast({
      status: 'error',
      render: ({ onClose }) => (
        <Box
          w="600px"
          borderRadius="8px"
          display="flex"
          alignItems="center"
          color="white"
          backgroundColor="sentiment.negativeDefault"
          gap="8px"
          p="16px"
        >
          <Text>
            <Trans t={t} values={desciptionValues ?? {}}>
              {key}
            </Trans>
          </Text>
          <CloseButton onClick={onClose} />
        </Box>
      ),
      isClosable: true,
    });
  };

  return { handleManalInputValidationError };
};

export default useActivityValueValidation;