"use client";
import { use } from "react";

import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";

export default function AuthLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);

  return (
    <main className="min-h-screen h-full flex flex-col">
      <NavigationBar lng={lng} showNav={false} isAuth />
      <div className="flex flex-row items-stretch flex-1">
        <div className="w-full">
          <div className="pt-[148px] pb-4 w-[480px] max-w-full mx-auto px-4">
            <Toaster />
            {props.children}
          </div>
        </div>
      </div>
    </main>
  );
}
