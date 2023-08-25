'use client'

import { NavigationBar } from "@/components/navigation-bar";

export default function AuthLayout({
  children,
  params: { lng },
}: {
  children: React.ReactNode,
  params: { lng: string },
}) {
  return (
    <main className="h-screen flex flex-col">
      <NavigationBar lng={lng} showNav={false} />
      <div className="w-full h-full bg-city bg-left-bottom bg-no-repeat px-8">
        {children}
      </div>
    </main>
  );
}

