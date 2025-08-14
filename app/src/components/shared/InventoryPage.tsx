"use client";

import { useParams } from "next/navigation";
import HomePage from "@/components/GHGIHomePage/HomePage";
import { getParamValueRequired } from "@/util/helpers";

export default function InventoryPage() {
  const params = useParams();
  const lng = getParamValueRequired(params.lng);

  return <HomePage lng={lng} isPublic={false} />;
}
