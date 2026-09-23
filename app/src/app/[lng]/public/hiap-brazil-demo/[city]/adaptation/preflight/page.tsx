"use client";
import React from "react";
import { TrackPreflight } from "../../../_components/TrackPreflight";

export default function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city } = React.use(props.params);
  return <TrackPreflight lng={lng} citySlug={city} track="adaptation" />;
}
