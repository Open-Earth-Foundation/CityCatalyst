import type { Metadata } from "next";
import React from "react";

import { ConceptNotesClientLayout } from "./ConceptNotesClientLayout";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: "Concept Note Builder",
};

export default function ConceptNotesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lng: string; cityId: string }>;
}) {
  return (
    <ConceptNotesClientLayout params={params}>
      {children}
    </ConceptNotesClientLayout>
  );
}
