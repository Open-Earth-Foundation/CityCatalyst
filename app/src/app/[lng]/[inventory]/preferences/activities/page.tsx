"use client";

import React, { use } from "react";
import { useTranslation } from "@/i18n/client";
import PreferencesPageLayout from "../PreferencesPageLayout";
import ActivitiesPage from "./ActivitiesPage";

import { LINKS } from "@/app/[lng]/[inventory]/preferences/constants";

export default function ActivitiesLayout(
  props: {
    params: Promise<{ lng: string }>;
  }
) {
  const params = use(props.params);

  const {
    lng
  } = params;

  const { t } = useTranslation(lng, "preferences");

  return (
    <PreferencesPageLayout step={1} t={t} next={LINKS[1]}>
      <ActivitiesPage t={t} />
    </PreferencesPageLayout>
  );
}
