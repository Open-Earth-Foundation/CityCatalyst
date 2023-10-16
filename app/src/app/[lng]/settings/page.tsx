"use client";

import React from "react";
import { useTranslation } from "@/i18n/client";
import { Trans } from "react-i18next/TransWithoutContext";
import { NavigationBar } from "@/components/navigation-bar";
import { Box } from "@chakra-ui/react";

export default function Settings({
  params: { lng },
}: {
  params: { lng: string };
}) {
  const { t } = useTranslation(lng, "settings");
  return (
    <>
      <NavigationBar lng={lng} />
      <Box className="flex mx-auto w-[1090px]">Settings</Box>
    </>
  );
}
