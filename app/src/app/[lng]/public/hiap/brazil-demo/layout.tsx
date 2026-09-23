import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeatureFlags, hasServerFeatureFlag } from "@/util/feature-flags";
import { DemoLayoutClient } from "./_components/DemoLayoutClient";

export const metadata: Metadata = {
  title: "HIAP Brazil Phase 3 — UI demo",
  robots: { index: false, follow: false },
};

/**
 * Public, unauthenticated, fixture-only demo of the Brazil Phase 3 HIAP UI.
 *
 * `proxy.ts` lets `/[lng]/public/*` through without a session; the flag keeps
 * the route a 404 everywhere it has not been switched on (dev only).
 */
export default async function DemoLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
}) {
  if (!hasServerFeatureFlag(FeatureFlags.HIAP_BR_DEMO)) notFound();
  const { lng } = await props.params;
  return <DemoLayoutClient lng={lng}>{props.children}</DemoLayoutClient>;
}
