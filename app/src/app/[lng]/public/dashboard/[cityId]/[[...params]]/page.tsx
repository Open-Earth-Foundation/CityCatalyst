import PublicDashboard from "@/components/PublicDashboard/PublicDashboard";

interface PublicDashboardPageProps {
  params: Promise<{ lng: string; cityId: string; params?: string[] }>;
}

export default function PublicDashboardPage({ params }: PublicDashboardPageProps) {
  return <PublicDashboard params={params} />;
}