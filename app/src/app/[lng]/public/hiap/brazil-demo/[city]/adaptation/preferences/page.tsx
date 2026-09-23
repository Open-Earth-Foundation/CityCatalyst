"use client";
import React from "react";
import { TrackPreferences } from "../../../_components/TrackPreferences";

export default function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city } = React.use(props.params);
  return <TrackPreferences lng={lng} citySlug={city} track="adaptation" />;
}
