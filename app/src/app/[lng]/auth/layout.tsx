"use client";

import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";

export default function AuthLayout({
  children,
  params: { lng },
}: {
  children: React.ReactNode;
  params: { lng: string };
}) {
  return (
    <main className="h-screen flex flex-col">
      <NavigationBar lng={lng} showNav={false} isAuth />
      <div className="flex flex-row items-stretch flex-1">
        <div className="w-full">
          <div className="pt-[148px] pb-4 w-[480px] max-w-full mx-auto px-4">
            <Toaster />
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
