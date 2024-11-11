"use client";

import React from "react";
import MinimalStepper from "./MinimalStepper";
import { Button, HStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { useRouter } from "next/navigation";

export default function PreferencesPageLayout({
  t,
  children,
  step,
}: {
  step: number;
  t: TFunction;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const onBack = () => {
    router.back();
  };
  return (
    <>
      {children}
      <MinimalStepper step={step} />
      <HStack my="4vh" mx={"10vw"} justifyContent="space-between">
        <Button variant={"ghost"} onClick={onBack}>
          {t("back")}
        </Button>
        <Button>{t("continue")}</Button>
      </HStack>
    </>
  );
}
