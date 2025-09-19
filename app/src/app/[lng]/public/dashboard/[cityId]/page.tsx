import PublicDashboard from "@/components/PublicDashboard/PublicDashboard";

interface PublicDashboardPageProps {
  params: Promise<{ lng: string; cityId: string }>;
}

export default function PublicDashboardPage({ params }: PublicDashboardPageProps) {
  return <PublicDashboard params={params} />;
}