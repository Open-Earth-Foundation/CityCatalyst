'use client'

import { NavigationBar } from "@/components/navigation-bar";
import { Heading } from "@chakra-ui/react";
import Image from 'next/image'

export default function Login() {
  return (
    <main>
      <NavigationBar />
      <div className="flex flex-row">
        <Image src="/path_vector_login.svg" width={200} height={800} alt="City roads" />
        <div className="p-16">
          <Heading>Login</Heading>
        </div>
      </div>
    </main>
  )
}
