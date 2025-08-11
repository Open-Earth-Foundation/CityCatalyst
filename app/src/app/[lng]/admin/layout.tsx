"use client";

import { NavigationBar } from "@/components/navigation-bar";
import { toaster, Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";
import { Roles } from "@/util/types";
import React, { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import {
  ProgressCircleRing,
  ProgressCircleRoot,
} from "@/components/ui/progress-circle";
import { useTranslation } from "@/i18n/client";
import { useSession } from "next-auth/react";

export default function AdminLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);
  const { t } = useTranslation(lng, "admin");
  const { children } = props;
  const router = useRouter();
  const { data } = useSession();

  useEffect(() => {
    if (data?.user?.role !== Roles.Admin) {
      toaster.error({
        title: t("not-authorized"),
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
      <NavigationBar lng={lng} />
      <Toaster />
      <Box w="full" h="full">
        {data?.user?.role === Roles.Admin ? (
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
              <ProgressCircleRoot value={null}>
                <ProgressCircleRing cap="round" />
              </ProgressCircleRoot>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
