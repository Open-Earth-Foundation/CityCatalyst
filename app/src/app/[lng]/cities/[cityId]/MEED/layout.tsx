import type { Metadata } from "next";
import React from "react";
import MEEDClientLayout from "./MEEDClientLayout";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// TODO: translate page titles using i18n once a RSC-safe locale helper is available
export const metadata: Metadata = {
  title: "Actions & Plans v2",
};

export default function MEEDLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string; cityId: string }>;
}) {
  return (
    <MEEDClientLayout params={props.params}>{props.children}</MEEDClientLayout>
  );
}
