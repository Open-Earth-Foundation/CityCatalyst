"use client";
import React from "react";
import { AdaptationHomeNext } from "../../_components/next/AdaptationHomeNext";

/** BR-N1 — proposal: the adaptation home with the ranking shown at once. */
export default function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city } = React.use(props.params);
  return <AdaptationHomeNext lng={lng} citySlug={city} />;
}
