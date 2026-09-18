import type { Metadata } from "next";
import React from "react";

import { ConceptNotesClientLayout } from "./ConceptNotesClientLayout";

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
