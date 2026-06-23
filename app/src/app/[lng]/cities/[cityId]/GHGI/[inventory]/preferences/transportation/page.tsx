"use client";

import React, { use } from "react";
import { useTranslation } from "@/i18n/client";
import PreferencesPageLayout from "@/components/GHGI/preferences/PreferencesPageLayout";
import TransportationPage from "@/components/GHGI/preferences/TransportationPage";

import { LINKS } from "@/components/GHGI/preferences/constants";

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
