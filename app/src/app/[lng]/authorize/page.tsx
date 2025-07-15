// app/[lng]/oauth/authorize/page.tsx
"use client";

import { useTranslation } from "@/i18n/client";
import {
  Box,
  Button,
  ButtonGroup,
  Heading,
  Text,
  VStack,
} from "@chakra-ui/react";
import { toaster } from "@/components/ui/toaster";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use } from "react";
import { useEffect } from "react";
import { getScopesForInventoryAndSector } from "@/util/constants";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";

async function generateCode(clientId: string, codeChallenge: string) {
  return "fake_code";
}

export default function Authorize(props: { params: Promise<{ lng: string }> }) {
  const { lng } = use(props.params);
  const { t } = useTranslation(lng, "oauth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthEnabled = hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)
  const clientId = searchParams.get("client_id")!;
  const redirectUri = searchParams.get("redirect_uri")!;
  const state = searchParams.get("state")!;
  const responseType = searchParams.get("response_type");
  const scope = searchParams.get("scope")!;
  const codeChallenge = searchParams.get("code_challenge")!;
  const codeChallengeMethod = searchParams.get("code_challenge_method")!;

  useEffect(() => {
    if (!clientId || !redirectUri) {
      toaster.error({
        title: t("error"),
        description: t("oauth-authorize-missing-parameters"),
        duration: 5000,
      });
    }
  }, [t, clientId, redirectUri]);

  useEffect(() => {
    if (redirectUri && clientId && !oauthEnabled) {
      const error = "server_error";
      const error_description = "OAuth disabled on this server";
      const params = new URLSearchParams(
        state
          ? { error, error_description, state }
          : { error, error_description },
      );
      router.push(`${redirectUri}?${params}`);
    }
  }, [redirectUri, clientId, router, state, oauthEnabled]);

  useEffect(() => {
    if (redirectUri && clientId && (!responseType || responseType !== "code")) {
      const error = "unsupported_response_type";
      const error_description = "Valid response_type: code";
      const params = new URLSearchParams(
        state
          ? { error, error_description, state }
          : { error, error_description },
      );
      router.push(`${redirectUri}?${params}`);
    }
  }, [redirectUri, clientId, router, state, responseType]);

  useEffect(() => {
    if (
      redirectUri &&
      clientId &&
      (!scope || scope.split(" ").some((s) => !["read", "write"].includes(s)))
    ) {
      const error = "invalid_scope";
      const error_description = "Valid scopes: read, write";
      const params = new URLSearchParams(
        state
          ? { error, error_description, state }
          : { error, error_description },
      );
      router.push(`${redirectUri}?${params}`);
    }
  }, [redirectUri, clientId, router, state, scope]);

  useEffect(() => {
    if (
      redirectUri &&
      clientId &&
      (!codeChallenge || !codeChallengeMethod || codeChallengeMethod !== "S256")
    ) {
      const error = "invalid_request";
      const error_description = "PKCE required";
      const params = new URLSearchParams(
        state
          ? { error, error_description, state }
          : { error, error_description },
      );
      router.push(`${redirectUri}?${params}`);
    }
  }, [
    redirectUri,
    clientId,
    router,
    state,
    codeChallenge,
    codeChallengeMethod,
  ]);

  if (!clientId || !redirectUri) {
    return null;
  }

  const handleAuthorize = async () => {
    const code = await generateCode(clientId, codeChallenge);

    const params = new URLSearchParams(state ? { code, state } : { code });
    router.push(`${redirectUri}?${params}`);
  };

  const handleCancel = () => {
    const error = "access_denied";
    const params = new URLSearchParams(state ? { error, state } : { error });
    router.push(`${redirectUri}?${params}`);
  };

  return (
    <Suspense fallback={<Text>{t("loading")}</Text>}>
      <Box maxW="md" mx="auto" mt={12} p={6} borderWidth={1} borderRadius="lg">
        <VStack gap={4} textAlign="center">
          <Heading size="lg">{t("oauth-authorize-heading")}</Heading>
          <Text>{t("oauth-authorize-prompt", { client: clientId })}</Text>
          <ButtonGroup>
            <Button colorScheme="blue" onClick={handleAuthorize}>
              {t("oauth-ok")}
            </Button>
            <Button onClick={handleCancel}>{t("oauth-cancel")}</Button>
          </ButtonGroup>
        </VStack>
      </Box>
    </Suspense>
  );
}
