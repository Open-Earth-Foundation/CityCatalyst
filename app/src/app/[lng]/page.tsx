'use client'

import { NavigationBar } from '@/components/navigation-bar'
import { Button, Heading } from '@chakra-ui/react'
import Link from 'next/link'

export default function Home({ params: { lng } }: { params: { lng: string } }) {
  return (
    <main>
      <NavigationBar lng={lng} />
      <div className="p-24 flex flex-col space-y-4 items-start">
        <Heading>Dashboard</Heading>
        <Link href={`/${lng}/login`} passHref legacyBehavior>
          <Button as="a" w={40}>
            Login
          </Button>
        </Link>
        <Link href={`/${lng}/signup`} passHref legacyBehavior>
          <Button as="a" w={40}>
            Sign Up
          </Button>
        </Link>
        <Link href={`/${lng}/onboarding`} passHref legacyBehavior>
          <Button as="a" w={40}>
            Onboarding
          </Button>
        </Link>
      </div>
    </main>
  )
}
