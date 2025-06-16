"use client";;
import { use } from "react";

import HomePage from "@/components/HomePage/HomePage";

export default function PrivateHome(
  props: {
    params: Promise<{ lng: string }>;
  }
) {
  const params = use(props.params);

  const {
    lng
  } = params;

  return <HomePage lng={lng} isPublic={false} />;
}
