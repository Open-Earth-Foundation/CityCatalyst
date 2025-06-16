"use client";

import { NavigationBar } from "@/components/navigation-bar";
import { toaster, Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";
import { api } from "@/services/api";
import { Roles } from "@/util/types";
import React, { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import {
  ProgressCircleRing,
  ProgressCircleRoot,
} from "@/components/ui/progress-circle";
import { useTranslation } from "@/i18n/client";
import { useSession } from "next-auth/react";
import ProgressLoader from "@/components/ProgressLoader";

export default function CitiesLayout(
  props: {
    children: React.ReactNode;
    params: Promise<{ lng: string }>;
  }
) {
  const params = use(props.params);

  const {
    lng
  } = params;

  const {
    children
  } = props;

  const router = useRouter();

  const { t } = useTranslation(lng, "admin");
  const { data } = useSession();

  useEffect(() => {
    if (data?.user.role !== Roles.Admin) {
      toaster.error({
        title: t("not-authorized"),
      });
      const REDIRECT_DELAY_MS = 2000;
      setTimeout(() => {
        const fallbackPath = `/${lng}`;
        router.push(fallbackPath);
      }, REDIRECT_DELAY_MS);
    }
  }, [data?.user.role, lng, router, t]);

  return (
    <Box className="h-full flex flex-col" bg="background.backgroundLight">
      <NavigationBar lng={lng} />
      <Toaster />
      <div className="w-full h-full">
        {data?.user?.role === Roles.Admin ? children : <ProgressLoader />}
      </div>
    </Box>
  );
}
