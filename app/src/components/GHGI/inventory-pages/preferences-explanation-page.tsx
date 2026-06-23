"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslation } from "@/i18n/client";
import PreferencesExplanation from "@/components/GHGI/preferences/PreferencesExplanation";
import PreferencesPageLayout from "@/components/GHGI/preferences/PreferencesPageLayout";
import { getParamValueRequired } from "@/util/helpers";

import { LINKS } from "@/components/GHGI/preferences/constants";

export default function PreferencesExplanationPage() {
  const params = useParams();
  const lng = getParamValueRequired(params.lng);
  const { t } = useTranslation(lng, "preferences");

  return (
    <PreferencesPageLayout step={0} t={t} next={LINKS[0]}>
      <PreferencesExplanation t={t} />
    </PreferencesPageLayout>
  );
}
