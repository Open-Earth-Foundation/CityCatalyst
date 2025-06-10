
import { Auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/models";
import Link from "next/link";
import CityBoundaryViewer from "./CityBoundaryViewer";

interface CityBoundaryPageProps {
  params: { lng: string; cityId: string };
}

export default async function CityBoundaryPage({ params }: CityBoundaryPageProps) {
  const session = await Auth.getServerSession();
  
  if (!session) {
    redirect(`/${params.lng}/auth/login`);
  }

  // Get the specific city and verify user access
  const city = await db.models.City.findOne({
    where: { cityId: params.cityId },
    include: [
      {
        model: db.models.Project,
        as: "project",
        include: [
          {
            model: db.models.User,
            as: "users",
            where: { userId: session.user.id },
            through: { attributes: [] }
          }
        ]
      }
    ]
  });

  if (!city) {
    return (
      <main className="container mx-auto p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-red-900 mb-2">
              City Not Found
            </h3>
            <p className="text-red-800">
              The city you're looking for doesn't exist or you don't have access to it.
            </p>
            <Link 
              href={`/${params.lng}/pocs/boundary-editor/select-city`}
              className="mt-4 inline-block text-red-600 hover:text-red-800"
            >
              ← Back to City Selection
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Link 
              href={`/${params.lng}/pocs/boundary-editor/select-city`}
              className="text-blue-600 hover:text-blue-800"
            >
              ← Back to City Selection
            </Link>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {city.name || "Unnamed City"}
              </h1>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span><strong>LOCODE:</strong> {city.locode}</span>
                <span><strong>Country:</strong> {city.country || "N/A"}</span>
                <span><strong>Region:</strong> {city.region || "N/A"}</span>
              </div>
            </div>
            <Link
              href={`/${params.lng}/pocs/boundary-editor/city/${params.cityId}/edit`}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              Modify Boundary
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Current City Boundary
          </h2>
          <CityBoundaryViewer 
            cityId={params.cityId}
            locode={city.locode}
            cityName={city.name}
          />
        </div>
      </div>
    </main>
  );
}
