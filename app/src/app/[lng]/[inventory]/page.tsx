"use client";

import HomePage from "@/components/HomePage/HomePage";

export default function PrivateHome({
  params: { lng },
}: {
  params: { lng: string };
}) {
  return <HomePage lng={lng} isPublic={false} />;
}
