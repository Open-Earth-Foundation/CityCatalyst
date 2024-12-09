"use client";

import React from "react";
import { useTranslation } from "@/i18n/client";
import PreferencesPageLayout from "../PreferencesPageLayout";
import ActivitiesPage from "./ActivitiesPage";

import { LINKS } from "@/app/[lng]/[inventory]/preferences/constants";

export default function ActivitiesLayout({
  params: { lng },
}: {
  params: { lng: string };
}) {
  const { t } = useTranslation(lng, "preferences");

  return (
    <PreferencesPageLayout step={1} t={t} next={LINKS[1]}>
      <ActivitiesPage t={t} />
    </PreferencesPageLayout>
  );
}
