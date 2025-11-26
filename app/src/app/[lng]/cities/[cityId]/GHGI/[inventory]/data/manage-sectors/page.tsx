"use client";

import ManageSubSectors from "@/app/[lng]/[inventory]/data/manage-sectors/page";

/**
 * JN route wrapper for manage sectors page
 * Reuses the GHGI manage sectors page component to keep DRY
 */
export default function GHGIManageSubSectors() {
  return <ManageSubSectors />;
}
