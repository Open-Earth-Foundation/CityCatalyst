"use client";

import ChatPopover from "@/components/ChatBot/chat-popover";
import { NavigationBar } from "@/components/navigation-bar";
import { toaster, Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";
import { api } from "@/services/api";
import { Roles } from "@/util/types";
import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ProgressCircleRing,
  ProgressCircleRoot,
} from "@/components/ui/progress-circle";

export default function AdminLayout({
  children,
  params: { lng, inventory },
}: {
  children: React.ReactNode;
  params: { lng: string; inventory: string };
}) {
  const router = useRouter();

  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();

  useEffect(() => {
    if (!isUserInfoLoading && userInfo?.role !== Roles.Admin) {
      toaster.error({
        title: "You are not authorized",
      });
      const REDIRECT_DELAY_MS = 2000;
      setTimeout(() => {
        const fallbackPath = userInfo?.defaultInventoryId
          ? `/${lng}/${userInfo.defaultInventoryId}`
          : `/${lng}`;
        router.push(fallbackPath);
      }, REDIRECT_DELAY_MS);
    }
  }, [isUserInfoLoading, userInfo, router, lng]);

  return (
    <Box className="h-full flex flex-col" bg="background.backgroundLight">
      <NavigationBar lng={lng} />
      <Toaster />
      <div className="w-full h-full">
        {!isUserInfoLoading && userInfo?.role === Roles.Admin ? (
          children
        ) : (
          <div className="flex items-center justify-center w-full">
            <Box className="w-full py-12 flex items-center justify-center">
              <ProgressCircleRoot value={null}>
                <ProgressCircleRing cap="round" />
              </ProgressCircleRoot>
            </Box>
          </div>
        )}
      </div>
      <ChatPopover inventoryId={inventory} />
    </Box>
  );
}
