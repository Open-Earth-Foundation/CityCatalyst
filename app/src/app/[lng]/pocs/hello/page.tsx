
import { Auth } from "@/lib/auth";
import { redirect } from "next/navigation";

interface HelloPageProps {
  params: { lng: string };
}

export default async function HelloPage({ params }: HelloPageProps) {
  const session = await Auth.getServerSession();
  
  if (!session) {
    redirect(`/${params.lng}/auth/login`);
  }

  return (
    <main className="container mx-auto p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Hello, {session.user?.name || "User"}! 👋
        </h1>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">
            POC Module Information
          </h2>
          <p className="text-blue-800 mb-4">
            This is a proof-of-concept module demonstrating how to create isolated features within CityCatalyst.
          </p>
          <div className="space-y-2 text-sm text-blue-700">
            <p><strong>User ID:</strong> {session.user?.id}</p>
            <p><strong>User Role:</strong> {session.user?.role}</p>
            <p><strong>Module Path:</strong> /pocs/hello</p>
          </div>
        </div>
      </div>
    </main>
  );
}
