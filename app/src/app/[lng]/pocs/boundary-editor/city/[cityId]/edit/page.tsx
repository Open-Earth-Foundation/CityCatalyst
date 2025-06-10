import { Auth } from "@/lib/auth";
import { db } from "@/models";
import { redirect } from "next/navigation";
import Link from "next/link";
import BoundaryEditor from "./BoundaryEditor";

interface EditBoundaryPageProps {
  params: { lng: string; cityId: string };
}

export default async function EditBoundaryPage({ params }: EditBoundaryPageProps) {
  const session = await Auth.getServerSession();

  if (!session) {
    redirect(`/${params.lng}/auth/login`);
  }

  // First check if user has access to this city
  const cityUserAccess = await db.models.CityUser.findOne({
    where: {
      userId: session.user.id,
      cityId: params.cityId
    }
  });

  if (!cityUserAccess) {
    redirect(`/${params.lng}/pocs/boundary-editor`);
  }

  // Get the specific city
  const city = await db.models.City.findOne({
    where: { cityId: params.cityId }
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
              href={`/${params.lng}/pocs/boundary-editor/city/${params.cityId}`}
              className="text-blue-600 hover:text-blue-800"
            >
              ← Back to Boundary View
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Edit Boundary: {city.name || "Unnamed City"}
          </h1>
          <p className="text-gray-600">
            Modify the city boundary by editing coordinates or drawing on the map
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <BoundaryEditor 
            cityId={params.cityId}
            locode={city.locode}
            cityName={city.name}
            lng={params.lng}
          />
        </div>
      </div>
    </main>
  );
}