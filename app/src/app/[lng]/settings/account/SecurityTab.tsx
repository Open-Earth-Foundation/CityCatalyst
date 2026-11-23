"use client";

import { BodyMedium, TitleMedium } from "@/components";
import { getIdentityPublicConfig } from "@/lib/identity-config";
import { Box, Button, VStack } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { UserInfoResponse } from "@/util/types";

/**
 * Password and 2FA are owned by core-identity-service (CC-1283).
 * This tab only links to the identity account security page.
 */
const SecurityTab = ({
  t,
}: {
  t: TFunction;
  userInfo?: UserInfoResponse;
}) => {
  const identity = getIdentityPublicConfig();
  const securityUrl = identity
    ? `${identity.issuer}/account/security/`
    : null;

  return (
    <VStack align="stretch" gap={4} mt={4}>
      <TitleMedium>{t("security")}</TitleMedium>
      <BodyMedium>{t("security-managed-by-identity")}</BodyMedium>
      {securityUrl ? (
        <Box>
          <Button
            onClick={() => {
              window.open(securityUrl, "_blank", "noopener,noreferrer");
            }}
          >
            {t("open-identity-security")}
          </Button>
        </Box>
      ) : null}
    </VStack>
  );
};

export default SecurityTab;
