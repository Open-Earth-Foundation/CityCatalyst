"use client";

import React, { use } from "react";
import { useTranslation } from "@/i18n/client";
import PreferencesPageLayout from "@/components/GHGI/preferences/PreferencesPageLayout";
import ActivitiesPage from "@/components/GHGI/preferences/ActivitiesPage";

import { LINKS } from "@/components/GHGI/preferences/constants";

export default function ActivitiesLayout(props: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);
  const { t } = useTranslation(lng, "preferences");

  return (
    <PreferencesPageLayout step={1} t={t} next={LINKS[1]}>
      <ActivitiesPage t={t} />
    </PreferencesPageLayout>
  );
}
