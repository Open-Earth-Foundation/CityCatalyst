import type { Metadata } from "next";
import React from "react";
import HIAPClientLayout from "./HIAPClientLayout";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

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
