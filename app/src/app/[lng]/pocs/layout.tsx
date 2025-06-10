
import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";

export default function POCLayout({
  children,
  params: { lng },
}: {
  children: React.ReactNode;
  params: { lng: string };
}) {
  return (
    <>
      <NavigationBar lng={lng} />
      <div className="min-h-screen bg-gray-50">
        <div className="py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-6">
              <nav className="text-sm text-gray-500">
                <a 
                  href={`/${lng}`} 
                  className="hover:text-blue-600 transition-colors"
                >
                  CityCatalyst
                </a>
                <span className="mx-2">›</span>
                <a 
                  href={`/${lng}/pocs`} 
                  className="text-blue-600 font-medium hover:text-blue-800 transition-colors"
                >
                  POC Modules
                </a>
              </nav>
            </div>
            {children}
          </div>
        </div>
      </div>
      <Toaster />
    </>
  );
}
