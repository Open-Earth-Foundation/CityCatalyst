'use client'

import Image from 'next/image';
import { NavigationBar } from "@/components/navigation-bar";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="h-screen flex flex-col">
      <NavigationBar />
      <div className="flex flex-row items-stretch h-full">
        <div className="bg-[#02061c] h-full">
          <Image src="/path_vector_login.svg" width={0} height={0} sizes="100vw 200px" alt="City roads" className="w-[400px]" />
        </div>
        <div className="w-full">
          <div className="pt-[148px] w-[445px] mx-auto">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}

