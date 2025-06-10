
import { Auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

interface BoundaryEditorPageProps {
  params: { lng: string };
}

export default async function BoundaryEditorPage({ params }: BoundaryEditorPageProps) {
  const session = await Auth.getServerSession();
  
  if (!session) {
    redirect(`/${params.lng}/auth/login`);
  }

  return (
    <main className="container mx-auto p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            City Boundary Editor
          </h1>
          <p className="text-gray-600">
            Select a city, view its boundary, and modify it as needed
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">
            Getting Started
          </h2>
          <p className="text-blue-800 mb-4">
            This module allows you to visualize and modify city boundaries for your projects.
          </p>
          <div className="space-y-2 text-sm text-blue-700">
            <p>• Select from your available cities</p>
            <p>• View current boundary on an interactive map</p>
            <p>• Modify boundary coordinates</p>
            <p>• Download updated boundary data</p>
          </div>
        </div>

        <div className="text-center">
          <Link
            href={`/${params.lng}/pocs/boundary-editor/select-city`}
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Start Editing Boundaries →
          </Link>
        </div>
      </div>
    </main>
  );
}
