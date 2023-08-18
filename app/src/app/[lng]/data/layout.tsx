"use client";

import { NavigationBar } from "@/components/navigation-bar";

export default function DataLayout({
  children,
  params: { lng },
}: {
  children: React.ReactNode;
  params: { lng: string };
}) {
  return (
    <main className="h-screen flex flex-col">
      <NavigationBar lng={lng} showNav={false} />
      <div className="w-full h-full">{children}</div>
    </main>
  );
}
