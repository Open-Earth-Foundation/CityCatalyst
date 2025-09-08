import CitiesDashboardPage from "@/components/CityDashboard/CityDashboard";

export default function CitiesDefaultPage(props: {
  params: Promise<{ lng: string; cityId: string }>;
}) {
  return <CitiesDashboardPage params={props.params} isPublic={true} />;
}
