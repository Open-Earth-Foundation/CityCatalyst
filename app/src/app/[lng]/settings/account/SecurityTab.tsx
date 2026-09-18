import { BodyMedium, TitleMedium } from "@/components";
import Disable2FAModal from "@/components/Modals/disable-2fa-modal";
import ProgressLoader from "@/components/ProgressLoader";
import { Tooltip } from "@/components/ui/tooltip";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { api } from "@/services/api";
import { UserInfoResponse } from "@/util/types";
import {
  Box,
  Button,
  chakra,
  Field,
  HStack,
  Icon,
  IconButton,
  Input,
  VStack,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { ChangeEvent, useState } from "react";
import { Trans } from "react-i18next";
import { MdCheckCircle, MdContentCopy, MdWarning } from "react-icons/md";

const SubmitButton = ({
  text,
  onClick,
  loading = false,
  disabled = false,
}: {
  text: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}) => {
  return (
    <Box display="flex" w="100%" justifyContent="right" marginTop="12px">
      <Button
        type="submit"
        loading={loading}
        h={16}
        minW="175px"
        disabled={disabled}
        onClick={onClick}
      >
        {text}
      </Button>
    </Box>
  );
};

const SecurityTab = ({
  t,
  userInfo,
}: {
  t: TFunction;
  userInfo?: UserInfoResponse;
}) => {
  const { showSuccessToast } = UseSuccessToast({
    title: t("two-factor-setup-success"),
    duration: 5000,
  });
  const { showErrorToast } = UseErrorToast({
    title: t("two-factor-setup-failed"),
    duration: 20000,
  });
  const { copyToClipboard, isCopied } = useCopyToClipboard({});

  const [
    setupSecondFactorAuth,
    { isLoading: isSetupLoading, data: setupResult },
  ] = api.useSetupSecondFactorAuthMutation();
  const [verifySecondFactorAuth, { isLoading: isVerifyLoading }] =
    api.useVerifySecondFactorAuthMutation();

  const [token, setToken] = useState("");
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [hasTokenError, setHasTokenError] = useState(false);
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const isEnabled = userInfo?.twoFactorEnabled ?? false;

  const setup2FA = async () => {
    const result = await setupSecondFactorAuth();
    if (result.data?.success) {
      setIsSetupMode(true);
    }
  };

  const verify2FA = async () => {
    const result = await verifySecondFactorAuth({ token });
    if (result.data?.success) {
      showSuccessToast();
      setHasTokenError(false);
      setRecoveryCodes(result.data?.recoveryCodes);
    } else {
      showErrorToast();
      setHasTokenError(true);
    }
  };

  return (
    <Box
      backgroundColor="white"
      p={6}
      display="flex"
      flexDirection="column"
      gap="24px"
      borderRadius="8px"
      boxShadow="shadow-lg"
    >
      {!userInfo ? (
        <ProgressLoader />
      ) : (
        <VStack spaceY={4} alignItems="left">
          <TitleMedium>{t("two-factor-heading")}</TitleMedium>
          {isEnabled ? (
            <>
              <BodyMedium>
                {t("two-factor-enabled-message")}
                <Icon
                  as={MdCheckCircle}
                  color="sentiment.positiveDefault"
                  boxSize={6}
                  ml={1}
                  mt={-1}
                />
              </BodyMedium>
              {recoveryCodes.length > 0 && (
                <>
                  <BodyMedium color="sentiment.negativeDefault">
                    <Icon
                      as={MdWarning}
                      color="sentiment.negativeDefault"
                      boxSize={6}
                      mr={1}
                      mt={-1}
                    />
                    <Trans t={t} i18nKey="two-factor-recovery-codes-message">
                      Text<u>Important</u>Text
                    </Trans>
                  </BodyMedium>
                  <HStack spaceX={4} align="top">
                    <pre>{recoveryCodes.join("\n")}</pre>
                    <Tooltip
                      content={t("two-factor-copy-recovery-codes-label")}
                    >
                      <IconButton
                        onClick={() =>
                          copyToClipboard(recoveryCodes.join("\n"))
                        }
                        variant="ghost"
                        aria-label={t("two-factor-copy-recovery-codes-label")}
                        color={
                          isCopied
                            ? "sentiment.positiveDefault"
                            : "content.tertiary"
                        }
                      >
                        <Icon
                          as={isCopied ? MdCheckCircle : MdContentCopy}
                          boxSize={5}
                        />
                      </IconButton>
                    </Tooltip>
                  </HStack>
                </>
              )}
              <BodyMedium>{t("two-factor-reset-message")}</BodyMedium>
              <SubmitButton
                text={t("two-factor-reset-button")}
                onClick={() => setIsDisableModalOpen(true)}
              />
            </>
          ) : !isSetupMode ? (
            <>
              <BodyMedium>{t("two-factor-setup-message")}</BodyMedium>
              <SubmitButton
                onClick={setup2FA}
                loading={isSetupLoading}
                text={t("two-factor-setup-button")}
              />
            </>
          ) : (
            <>
              <BodyMedium>{t("two-factor-scan-message")}</BodyMedium>
              {setupResult?.qrCodeDataUrl && (
                <chakra.img
                  src={setupResult.qrCodeDataUrl}
                  alt={t("two-factor-qr-code-alt")}
                  maxW={400}
                />
              )}
              <form
                onSubmit={(event) => {
                  verify2FA();
                  event.preventDefault();
                }}
              >
                <Field.Root invalid={hasTokenError} mb={4}>
                  <Input
                    value={token}
                    placeholder={t("two-factor-token-placeholder")}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setToken(e.currentTarget.value)
                    }
                  />
                  <Field.ErrorText>
                    {t("two-factor-invalid-code")}
                  </Field.ErrorText>
                </Field.Root>
                <SubmitButton
                  text={t("two-factor-verify-button")}
                  onClick={verify2FA}
                  loading={isVerifyLoading}
                />
              </form>
            </>
          )}
        </VStack>
      )}
      <Disable2FAModal
        t={t}
        isOpen={isDisableModalOpen}
        onClose={() => setIsDisableModalOpen(false)}
      />
    </Box>
  );
};

export default SecurityTab;
