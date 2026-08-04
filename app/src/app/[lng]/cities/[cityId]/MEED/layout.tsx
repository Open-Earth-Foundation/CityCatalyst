import type { Metadata } from "next";
import React from "react";
import MEEDClientLayout from "./MEEDClientLayout";

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
