"use client";
import React from "react";
import { TrackResults } from "../../../_components/TrackResults";

export default function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city } = React.use(props.params);
  return <TrackResults lng={lng} citySlug={city} track="adaptation" />;
}
