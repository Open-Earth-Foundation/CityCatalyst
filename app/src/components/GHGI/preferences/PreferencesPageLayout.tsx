"use client";

import React from "react";
import MinimalStepper from "./MinimalStepper";
import { Button, HStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { usePathname, useRouter } from "next/navigation";

export default function PreferencesPageLayout({
  t,
  children,
  step,
  next,
}: {
  step: number;
  t: TFunction;
  children: React.ReactNode;
  next: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const onBack = () => {
    router.back();
  };
  const onContinue = () => {
    const currentPath = pathname.replace(/\/$/, ""); // Remove trailing slash if it exists
    const newPath = `${currentPath.split("/").slice(0, -1).join("/")}/${next}`;
    router.push(newPath);
  };

  return (
    <>
      {children}
      <MinimalStepper step={step} />
      <HStack my="4vh" mx={"10vw"} justifyContent="space-between">
        <Button variant={"ghost"} onClick={onBack}>
          {t("back")}
        </Button>
        <Button onClick={onContinue}>{t("continue")}</Button>
      </HStack>
    </>
  );
}
