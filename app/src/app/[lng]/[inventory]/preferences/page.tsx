"use client";

import React from "react";
import { useTranslation } from "@/i18n/client";
import PreferencesExplanation from "./PreferencesExplanation";
import PreferencesPageLayout from "./PreferencesPageLayout";

import { LINKS } from "@/app/[lng]/[inventory]/preferences/constants";

export default function PreferencesExplanationPage({
  params: { lng },
}: {
  params: { lng: string };
}) {
  const { t } = useTranslation(lng, "preferences");
  return (
    <PreferencesPageLayout step={0} t={t} next={LINKS[0]}>
      <PreferencesExplanation t={t} />
    </PreferencesPageLayout>
  );
}
