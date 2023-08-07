'use client'

import Image from 'next/image';
import { NavigationBar } from "@/components/navigation-bar";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="h-screen flex flex-col">
      <NavigationBar />
      <div className="flex flex-row items-stretch h-full">
        <div className="bg-[#02061c] w-[485px] h-full hidden md:block bg-roads bg-no-repeat" />
        <div className="w-full">
          <div className="pt-[148px] w-[480px] max-w-full mx-auto px-4">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}

