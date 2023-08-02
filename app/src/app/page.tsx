'use client'

import { NavigationBar } from '@/components/navigation-bar'
import { Link } from '@chakra-ui/next-js'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <NavigationBar />
      <h1>Home</h1>
      <Link href="/login">Login</Link>
    </main>
  )
}
