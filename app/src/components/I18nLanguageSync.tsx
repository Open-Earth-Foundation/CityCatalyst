"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import i18next from "i18next";
import Cookies from "js-cookie";
import { languages } from "@/i18n/settings";

/**
 * Keeps the client-side i18next instance aligned with the `[lng]` URL segment.
 * Without this, translations only update after a full page reload.
 */
export default function I18nLanguageSync() {
  const params = useParams();
  const lngParam = params.lng;
  const lng = Array.isArray(lngParam) ? lngParam[0] : lngParam;

  useEffect(() => {
    if (!lng || !languages.includes(lng)) return;
    if (i18next.resolvedLanguage === lng) return;

    Cookies.set("i18next", lng, { path: "/", sameSite: "strict" });
    void i18next.changeLanguage(lng);
  }, [lng]);

  return null;
}
