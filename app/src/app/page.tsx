'use client'

import { NavigationBar } from '@/components/navigation-bar'
import { Button, Heading, Text } from '@chakra-ui/react'
import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <NavigationBar />
      <div className="p-24 flex flex-col space-y-4 items-start">
        <Heading>Dashboard</Heading>
        <Link href="/login" passHref legacyBehavior>
          <Button as="a" w={32}>
            Login
          </Button>
        </Link>
        <Link href="/signup" passHref legacyBehavior>
          <Button as="a" w={32}>
            Sign Up
          </Button>
        </Link>
      </div>
    </main>
  )
}
