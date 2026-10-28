"use client";
import React from "react";
import { TrackProcessing } from "../../../_components/TrackProcessing";

export default function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city } = React.use(props.params);
  return <TrackProcessing lng={lng} citySlug={city} track="mitigation" />;
}
