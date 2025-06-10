
import { Auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

interface POCIndexProps {
  params: { lng: string };
}

export default async function POCIndex({ params }: POCIndexProps) {
  const session = await Auth.getServerSession();
  
  if (!session) {
    redirect(`/${params.lng}/auth/login`);
  }

  const pocModules = [
    {
      name: "Hello Module",
      path: "hello",
      description: "Simple greeting module demonstrating POC structure",
      status: "Active"
    },
    {
      name: "Boundary Editor",
      path: "boundary-editor",
      description: "Multi-page module for viewing and modifying city boundaries",
      status: "Active"
    }
    // Add more POC modules here as they're created
  ];

  return (
    <main className="container mx-auto">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            POC Modules
          </h1>
          <p className="text-gray-600">
            Experimental features and proof-of-concept modules for CityCatalyst
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {pocModules.map((module) => (
            <Link
              key={module.path}
              href={`/${params.lng}/pocs/${module.path}`}
              className="block bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">
                  {module.name}
                </h3>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  {module.status}
                </span>
              </div>
              <p className="text-gray-600 text-sm">
                {module.description}
              </p>
              <div className="mt-4 text-sm text-blue-600 font-medium">
                View Module →
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-12 bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-yellow-900 mb-2">
            🚧 Development Guidelines
          </h3>
          <div className="text-yellow-800 space-y-2 text-sm">
            <p>• POC modules are isolated and don't affect core functionality</p>
            <p>• Each module should be self-contained in its own directory</p>
            <p>• Use existing auth patterns and database connections</p>
            <p>• Follow the established file structure for consistency</p>
          </div>
        </div>
      </div>
    </main>
  );
}
