import { BodyMedium } from "@/components";
import HeadingText from "@/components/heading-text";
import ProgressLoader from "@/components/ProgressLoader";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import { api } from "@/services/api";
import { UserInfoResponse } from "@/util/types";
import { Box, Button, chakra, Icon, Input, VStack } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { ChangeEvent, useState } from "react";
import { MdCheckCircle } from "react-icons/md";

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
    duration: 0,
  });

  const [
    setupSecondFactorAuth,
    { isLoading: isSetupLoading, data: setupResult },
  ] = api.useSetupSecondFactorAuthMutation();
  const [verifySecondFactorAuth, { isLoading: isVerifyLoading }] =
    api.useVerifySecondFactorAuthMutation();

  const [token, setToken] = useState("");
  const [isSetupMode, setIsSetupMode] = useState(false);

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
    } else {
      showErrorToast();
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
        <Box display="flex" w="100%" justifyContent="left" marginTop="12px">
          <VStack spaceY={4} alignItems="left">
            <HeadingText title={t("two-factor-heading")} />
            {isEnabled ? (
              /* TODO allow repeating setup */
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
            ) : !isSetupMode ? (
              <Button onClick={setup2FA} loading={isSetupLoading}>
                {t("two-factor-setup-button")}
              </Button>
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
                <Input
                  value={token}
                  placeholder={t("two-factor-token-placeholder")}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setToken(e.currentTarget.value)
                  }
                />
                <Button onClick={verify2FA} loading={isVerifyLoading}>
                  {t("two-factor-verify-button")}
                </Button>
              </VStack>
            )}
          </VStack>
        </Box>
      )}
    </Box>
  );
};

export default SecurityTab;
