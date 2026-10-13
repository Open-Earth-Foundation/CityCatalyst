"use client";
import React from "react";
import { MitigationArea } from "../../../_components/MitigationArea";

export default function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city } = React.use(props.params);
  return <MitigationArea lng={lng} citySlug={city} area="legal" />;
}
