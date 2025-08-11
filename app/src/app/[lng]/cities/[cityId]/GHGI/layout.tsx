"use client";

import React from "react";
import { useModuleAccessLayout } from "@/hooks/useModuleAccessLayout";
import { Modules } from "@/util/constants";

const GHGI_MODULE_ID = Modules.GHGI.id;

export default function GHGILayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string; cityId: string }>;
}) {
  return useModuleAccessLayout({
    params: props.params,
    moduleId: GHGI_MODULE_ID,
    children: props.children,
  });
}
