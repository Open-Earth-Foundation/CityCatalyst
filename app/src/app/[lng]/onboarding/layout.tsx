'use client'

import Image from 'next/image';
import { NavigationBar } from "@/components/navigation-bar";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="h-screen flex flex-col">
      <NavigationBar />
      <div className="w-full h-full bg-city bg-left-bottom bg-no-repeat">
        <div className="pt-[148px] w-[750px] max-w-full mx-auto px-4">
          {children}
        </div>
      </div>
    </main>
  );
}

