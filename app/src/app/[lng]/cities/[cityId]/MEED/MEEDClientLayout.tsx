"use client";

import React from "react";
import { useModuleAccessLayout } from "@/hooks/useModuleAccessLayout";
import { Modules } from "@/util/constants";

const MEED_MODULE_ID = Modules.MEED.id;

export default function MEEDClientLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string; cityId: string }>;
}) {
  return useModuleAccessLayout({
    params: props.params,
    moduleId: MEED_MODULE_ID,
    children: props.children,
  });
}
