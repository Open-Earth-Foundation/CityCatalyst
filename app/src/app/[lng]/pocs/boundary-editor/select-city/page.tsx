import { Auth } from "@/lib/auth";
import { db } from "@/models";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Op } from "sequelize";

interface SelectCityPageProps {
  params: { lng: string };
}

export default async function SelectCityPage({ params }: SelectCityPageProps) {
  const session = await Auth.getServerSession();

  if (!session) {
    redirect(`/${params.lng}/auth/login`);
  }

  // Initialize database if not already done
  if (!db.initialized) {
    await db.initialize();
  }

  // Get cities that the user has access to and have boundaries (locode)
  // Get cities through CityUser relationship
  const cityUsers = await db.models.CityUser.findAll({
    where: { userId: session.user.id },
    include: [
      {
        model: db.models.City,
        as: "city",
        where: {
          locode: { [Op.ne]: null } // Only cities with locodes (boundaries available)
        }
      }
    ]
  });

  const userCities = cityUsers.map(cityUser => cityUser.city);

  return (
    <main className="container mx-auto p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Link 
              href={`/${params.lng}/pocs/boundary-editor`}
              className="text-blue-600 hover:text-blue-800"
            >
              ← Back to Boundary Editor
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Select a City
          </h1>
          <p className="text-gray-600">
            Choose a city to view and modify its boundary
          </p>
        </div>

        {userCities.length === 0 ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-yellow-900 mb-2">
              No Cities Available
            </h3>
            <p className="text-yellow-800">
              You don't have any cities with available boundaries. Cities need to have a valid LOCODE to display boundaries.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {userCities.map((city: any) => (
              <Link
                key={city.cityId}
                href={`/${params.lng}/pocs/boundary-editor/city/${city.cityId}`}
                className="block bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {city.name || "Unnamed City"}
                  </h3>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {city.locode}
                  </span>
                </div>
                <div className="space-y-1 text-sm text-gray-600">
                  <p><strong>Country:</strong> {city.country || "N/A"}</p>
                  <p><strong>Region:</strong> {city.region || "N/A"}</p>
                  {city.area && <p><strong>Area:</strong> {city.area.toLocaleString()} sq km</p>}
                </div>
                <div className="mt-4 text-sm text-blue-600 font-medium">
                  View Boundary →
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}