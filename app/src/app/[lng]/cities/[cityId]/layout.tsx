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

  return (
    <Box
      h="full"
      display="flex"
      flexDirection="column"
      bg="background.backgroundLight"
    >
      <Box w="full" h="full">
        {children}
      </Box>
    </Box>
  );
}
