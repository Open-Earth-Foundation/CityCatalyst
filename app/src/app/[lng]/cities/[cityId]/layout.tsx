"use client";

import { toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";
import React, { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/i18n/client";
import { useSession } from "next-auth/react";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import ProgressLoader from "@/components/ProgressLoader";

export default function CitiesLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);
  const { t } = useTranslation(lng, "not-found");
  const { children } = props;
  const router = useRouter();
  const { data } = useSession();

  useEffect(() => {
    if (!hasFeatureFlag(FeatureFlags.JN_ENABLED)) {
      toaster.error({
        title: t("not-found-description"),
      });
      const REDIRECT_DELAY_MS = 2000;
      setTimeout(() => {
        const fallbackPath = `/${lng}`;
        router.push(fallbackPath);
      }, REDIRECT_DELAY_MS);
    }
  }, [data, router, lng, t]);

  return (
    <Box
      h="full"
      display="flex"
      flexDirection="column"
      bg="background.backgroundLight"
    >
      <Box w="full" h="full">
        {hasFeatureFlag(FeatureFlags.JN_ENABLED) ? (
          children
        ) : (
          <Box
            display="flex"
            alignItems="center"
            justifyContent="center"
            w="full"
          >
            <Box
              w="full"
              py={12}
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <ProgressLoader />
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
