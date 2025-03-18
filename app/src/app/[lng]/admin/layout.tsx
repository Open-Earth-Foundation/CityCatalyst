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
import { useSession } from "next-auth/react";

export default function AdminLayout({
  children,
  params: { lng, inventory },
}: {
  children: React.ReactNode;
  params: { lng: string; inventory: string };
}) {
  const router = useRouter();

  const { data } = useSession();

  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();

  useEffect(() => {
    if (!isUserInfoLoading && !(userInfo?.role === Roles.Admin)) {
      toaster.error({
        title: "You are not authorized",
      });
      setTimeout(() => {
        router.push(`/${lng}/${userInfo?.defaultInventoryId}`);
      }, 2000);
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
