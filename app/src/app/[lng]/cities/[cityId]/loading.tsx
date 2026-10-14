import HomeHeroSkeleton from "@/components/Skeletons/home-hero-skeleton";
import PageSectionsSkeleton from "@/components/Skeletons/page-sections-skeleton";

export default function Loading() {
  return (
    <>
      <HomeHeroSkeleton />
      <PageSectionsSkeleton />
    </>
  );
}
