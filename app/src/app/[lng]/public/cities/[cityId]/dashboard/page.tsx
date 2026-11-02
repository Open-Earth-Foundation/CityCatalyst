import { PublicDashboardService } from "@/backend/PublicDashboardService";
import { PublicDashboardShell } from "@/components/PublicDashboard/PublicDashboardShell";
import MissingCityDashboard from "@/components/missing-city-dashboard";
import type { CityWithProjectDataResponse } from "@/util/types";
import { connection } from "next/server";

export default async function CitiesDefaultPage(props: {
  params: Promise<{ lng: string; cityId: string }>;
}) {
  // DB access below isn't cacheable (per-city, always fresh) and the
  // Sequelize/pg driver reads Date.now() internally, which Next.js
  // rejects during prerendering - defer this whole segment to request time.
  await connection();
  const { lng, cityId } = await props.params;
  const shell = await PublicDashboardService.getDashboardShell(cityId);

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
    />
  );
}
