"use client";

import React, { use } from "react";

import { Box } from "@chakra-ui/react";

import ProgressLoader from "@/components/ProgressLoader";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { Modules } from "@/util/constants";

export function ConceptNotesClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lng: string; cityId: string }>;
}) {
  const { cityId, lng } = use(params);
  const { hasAccess, isAccessLoading } = useModuleAccess({
    cityId,
    moduleId: Modules.CONCEPT_NOTE_BUILDER.id,
    lng,
    fallbackPath: `/${lng}/cities/${cityId}`,
  });

  if (isAccessLoading || !hasAccess) {
    return (
      <Box
        display="flex"
        minH="60vh"
        w="full"
        alignItems="center"
        justifyContent="center"
      >
        <ProgressLoader />
      </Box>
    );
  }

  return <>{children}</>;
}
