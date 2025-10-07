"use client";

import SubSectorPage from "@/app/[lng]/[inventory]/data/[step]/[subsector]/page";

/**
 * JN route wrapper for subsector data page
 * Reuses the GHGI subsector page component to keep DRY
 */
export default function GHGISubSectorPage(props: {
  params: Promise<{
    lng: string;
    cityId: string;
    inventory: string;
    step: string;
    subsector: string;
  }>;
}) {
  // Pass params through directly - both routes use same param names
  return <SubSectorPage params={props.params} />;
}

