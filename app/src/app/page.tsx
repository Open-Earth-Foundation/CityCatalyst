'use client'

import { NavigationBar } from '@/components/navigation-bar'
import { Button, Heading, Text } from '@chakra-ui/react'
import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <NavigationBar />
      <div className="p-24">
        <Heading>Home</Heading>
        <Link href="/login" passHref>
          <Button color="white" background="blue" as="a">
            Login
          </Button>
        </Link>
      </div>
    </main>
  )
}
