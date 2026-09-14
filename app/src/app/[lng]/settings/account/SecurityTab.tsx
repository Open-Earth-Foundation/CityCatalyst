import { BodyMedium, TitleMedium } from "@/components";
import ProgressLoader from "@/components/ProgressLoader";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import { api } from "@/services/api";
import { UserInfoResponse } from "@/util/types";
import {
  Box,
  Button,
  chakra,
  Field,
  Icon,
  Input,
  VStack,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { ChangeEvent, useState } from "react";
import { MdCheckCircle } from "react-icons/md";

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

  const [
    setupSecondFactorAuth,
    { isLoading: isSetupLoading, data: setupResult },
  ] = api.useSetupSecondFactorAuthMutation();
  const [verifySecondFactorAuth, { isLoading: isVerifyLoading }] =
    api.useVerifySecondFactorAuthMutation();
  const [disableSecondFactorAuth, { isLoading: isDisableLoading }] =
    api.useDisableSecondFactorAuthMutation();

  const [token, setToken] = useState("");
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [hasTokenError, setHasTokenError] = useState(false);

  const isEnabled = userInfo?.twoFactorEnabled ?? false;

  const setup2FA = async () => {
    const result = await setupSecondFactorAuth();
    console.log("2FA result", result);
    if (result.data?.success) {
      setIsSetupMode(true);
    }
  };

  const verify2FA = async () => {
    const result = await verifySecondFactorAuth({ token });
    console.log("Verify result", result);
    if (result.data?.success) {
      showSuccessToast();
      setHasTokenError(false);
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
            /* TODO allow repeating setup */
            <VStack spaceY={4} alignItems="left">
              <BodyMedium>
                {t("two-factor-enabled-message")}
                <Icon
                  as={MdCheckCircle}
                  color="sentiment.positiveDefault"
                  boxSize={6}
                  ml={1}
                  mt={-1}
                />
                <br />
                <br />
                {t("two-factor-reset-message")}
              </BodyMedium>
              <SubmitButton
                text={t("two-factor-reset-button")}
                onClick={() => disableSecondFactorAuth()}
                loading={isDisableLoading}
              />
            </VStack>
          ) : !isSetupMode ? (
            <VStack spaceY={4} alignItems="left">
              <BodyMedium>{t("two-factor-setup-message")}</BodyMedium>
              <SubmitButton
                onClick={setup2FA}
                loading={isSetupLoading}
                text={t("two-factor-setup-button")}
              />
            </VStack>
          ) : (
            <VStack spaceY={4} alignItems="left">
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
                    onSubmit={() => console.log("submit")}
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
            </VStack>
          )}
        </VStack>
      )}
    </Box>
  );
};

export default SecurityTab;
