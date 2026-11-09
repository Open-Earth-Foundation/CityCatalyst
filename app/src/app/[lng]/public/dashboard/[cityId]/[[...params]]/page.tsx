import { io } from "next/cache";
import { PublicDashboardService } from "@/backend/PublicDashboardService";
import { PublicDashboardShell } from "@/components/PublicDashboard/PublicDashboardShell";
import MissingCityDashboard from "@/components/missing-city-dashboard";
import type { CityWithProjectDataResponse } from "@/util/types";

interface PublicDashboardPageProps {
  params: Promise<{ lng: string; cityId: string; params?: string[] }>;
}

export default async function PublicDashboardPage({
  params,
}: PublicDashboardPageProps) {
  // DB access below isn't cacheable (per-city, always fresh) and the
  // Sequelize/pg driver reads Date.now() internally, which Next.js
  // treats as unstable during prerendering - exclude it from the shell.
  await io();
  const { lng, cityId, params: routeParams } = await params;
  const yearParam = routeParams?.[0]; // First catch-all segment is the year
  const year = yearParam ? parseInt(yearParam) : undefined;

  const shell = await PublicDashboardService.getDashboardShell(cityId, year);

  if (shell.status === "not-found") {
    return <MissingCityDashboard lng={lng} cityId={cityId} isPublic />;
  }

  const { ghgi, hiap, ccra } = PublicDashboardService.getStreamableWidgetData(
    cityId,
    shell.latestInventory,
    lng,
  );
  const [ghgiData, hiapData, ccraData] = await Promise.all([ghgi, hiap, ccra]);

  return (
    <PublicDashboardShell
      lng={lng}
      cityId={cityId}
      city={shell.city as unknown as CityWithProjectDataResponse}
      inventories={shell.inventories}
      population={shell.population}
      latestInventory={shell.latestInventory}
      ghgiData={ghgiData}
      hiapData={hiapData}
      ccraData={ccraData}
      hideMap
    />
  );
}
