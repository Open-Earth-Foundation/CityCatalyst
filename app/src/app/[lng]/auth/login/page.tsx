"use client";

import { useTranslation } from "@/i18n/client";
import { Box, Heading, Text } from "@chakra-ui/react";
import { useSearchParams } from "next/navigation";
import { use, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLogin } from "@/hooks/useLogin";
import {
  getIdentityPublicConfig,
  isIdentityLoginEnabledClient,
} from "@/lib/identity-config";

export default function Login(props: { params: Promise<{ lng: string }> }) {
  const { lng } = use(props.params);
  const { t } = useTranslation(lng, "auth");
  const { loginWithIdentity, isLoading, error } = useLogin();
  const [isFormReady, setIsFormReady] = useState(false);
  useEffect(() => {
    setIsFormReady(true);
  }, []);

  const searchParams = useSearchParams();
  const queryParams = Object.fromEntries(searchParams.entries());
  let callbackUrl = decodeURIComponent(queryParams.callbackUrl || "");
  if (callbackUrl && !callbackUrl.startsWith("/")) {
    callbackUrl = "";
  }
  if (!callbackUrl && !("token" in queryParams)) {
    callbackUrl = `/`;
  }

  const identityConfigured =
    isIdentityLoginEnabledClient() || getIdentityPublicConfig() != null;

  return (
    <Box>
      <Heading size="xl">{t("login-heading")}</Heading>
      <Text my={4} color="content.tertiary">
        {t("login-identity-details")}
      </Text>
      {error ? (
        <Text color="semantic.danger" mb={4}>
          {error}
        </Text>
      ) : null}
      {!identityConfigured ? (
        <Text color="semantic.danger">
          Identity login is not configured. Set NEXT_PUBLIC_IDENTITY_ISSUER and
          NEXT_PUBLIC_IDENTITY_CLIENT_ID.
        </Text>
      ) : (
        <Button
          type="button"
          data-testid="identity-login-button"
          loading={isLoading}
          disabled={!isFormReady || isLoading}
          h={16}
          width="full"
          bgColor="interactive.secondary"
          onClick={() => loginWithIdentity(callbackUrl || `/${lng}/`)}
        >
          {t("log-in-with-identity")}
        </Button>
      )}
    </Box>
  );
}
