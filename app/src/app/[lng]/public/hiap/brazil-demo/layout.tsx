import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FeatureFlags, hasServerFeatureFlag } from "@/util/feature-flags";
import { DemoLayoutClient } from "./_components/DemoLayoutClient";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

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
  // Read the flag at request time, not from the empty build env (cacheComponents).
  await connection();
  if (!hasServerFeatureFlag(FeatureFlags.HIAP_BR_DEMO)) notFound();
  const { lng } = await props.params;
  return <DemoLayoutClient lng={lng}>{props.children}</DemoLayoutClient>;
}
