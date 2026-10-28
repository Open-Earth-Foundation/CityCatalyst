"use client";

import { useParams } from "next/navigation";

import { NotFoundPage } from "@/components/not-found-page";
import { fallbackLng, languages } from "@/i18n/settings";

export default function ConceptNotesNotFound() {
  const params = useParams();
  const rawLng = params?.lng;
  const requestedLng = Array.isArray(rawLng) ? rawLng[0] : rawLng;
  const lng =
    requestedLng && languages.includes(requestedLng)
      ? requestedLng
      : fallbackLng;

  return <NotFoundPage lng={lng} />;
}
