import type { Metadata } from "next";
import React from "react";
import HIAPClientLayout from "./HIAPClientLayout";

// TODO: translate page titles using i18n once a RSC-safe locale helper is available
export const metadata: Metadata = {
  title: "High Impact Action Plan",
};

export default function HIAPLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string; cityId: string }>;
}) {
  return (
    <HIAPClientLayout params={props.params}>
      {props.children}
    </HIAPClientLayout>
  );
}
