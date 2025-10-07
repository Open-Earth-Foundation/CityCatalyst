"use client";

import ReviewPage from "@/app/[lng]/[inventory]/data/review/page";

/**
 * JN route wrapper for review page
 * Reuses the GHGI review page component to keep DRY
 */
export default function GHGIReviewPage() {
  return <ReviewPage />;
}
