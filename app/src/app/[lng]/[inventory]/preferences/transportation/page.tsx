"use client";

import React, { use } from "react";
import { useTranslation } from "@/i18n/client";
import PreferencesPageLayout from "../PreferencesPageLayout";
import TransportationPage from "./TransportationPage";

import { LINKS } from "@/app/[lng]/[inventory]/preferences/constants";

export default function TransportationLayout(props: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);
  const { t } = useTranslation(lng, "preferences");

  return (
    <PreferencesPageLayout step={2} t={t} next={LINKS[2]}>
      <TransportationPage t={t} />
    </PreferencesPageLayout>
  );
}
