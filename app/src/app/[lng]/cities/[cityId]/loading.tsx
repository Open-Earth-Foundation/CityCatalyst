import HomeHeroSkeleton from "@/components/Skeletons/home-hero-skeleton";
import PageSectionsSkeleton from "@/components/Skeletons/page-sections-skeleton";

/**
 * This segment's Suspense boundary also wraps child routes (HIAP, settings,
 * etc.) that don't have their own loading.tsx, so soft-nav into those can
 * briefly flash this city-home skeleton too. Known follow-up for CC-831.
 */
export default function Loading() {
  return (
    <>
      <HomeHeroSkeleton />
      <PageSectionsSkeleton />
    </>
  );
}
