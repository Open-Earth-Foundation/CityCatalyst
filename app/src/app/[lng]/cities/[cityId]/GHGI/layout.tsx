import type { Metadata } from "next";
import React from "react";
import GHGIClientLayout from "./GHGIClientLayout";

// TODO: translate page titles using i18n once a RSC-safe locale helper is available
export const metadata: Metadata = {
  title: "GHG Inventories",
};

export default function GHGILayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string; cityId: string }>;
}) {
  return (
    <GHGIClientLayout params={props.params}>
      {props.children}
    </GHGIClientLayout>
  );
}
