"use client";

import React from "react";
import { useModuleAccessLayout } from "@/hooks/useModuleAccessLayout";
import { Modules } from "@/util/constants";

const HIAP_MODULE_ID = Modules.HIAP.id;

export default function HIAPLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string; cityId: string }>;
}) {
  return useModuleAccessLayout({
    params: props.params,
    moduleId: HIAP_MODULE_ID,
    children: props.children,
  });
}
