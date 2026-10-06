"use client";
import React from "react";
import { TrackHome } from "../../_components/TrackHome";

export default function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city } = React.use(props.params);
  return <TrackHome lng={lng} citySlug={city} track="adaptation" />;
}
