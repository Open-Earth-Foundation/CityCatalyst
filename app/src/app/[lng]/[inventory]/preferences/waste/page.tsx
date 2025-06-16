"use client";

import React, { use } from "react";
import { useTranslation } from "@/i18n/client";
import PreferencesPageLayout from "../PreferencesPageLayout";
import WastePage from "./WastePage";

import { LINKS } from "@/app/[lng]/[inventory]/preferences/constants";

export default function WasteLayout(
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
    <PreferencesPageLayout step={3} t={t} next={LINKS[2]}>
      <WastePage t={t} />
    </PreferencesPageLayout>
  );
}
