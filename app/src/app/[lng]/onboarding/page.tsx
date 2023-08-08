'use client'

import { Button, Heading, Text } from "@chakra-ui/react";
import NextLink from 'next/link';

export default function Onboarding() {
  return (
    <div className="pt-[148px] w-[750px] max-w-full mx-auto px-4">
      <Heading size="xl" color="brand" mb={6}>Let's Start Your Emissions Inventory!</Heading>
      <Text color="tertiary">
        We need to set and confirm the city where you want to do the inventory.
        <br />
        You are one step closer to getting your GPC emissions inventory!
      </Text>
      <NextLink href="/onboarding/setup" passHref legacyBehavior>
        <Button as="a" h={16} px={6} mt={8}>
          Start City Inventory Profile
        </Button>
      </NextLink>
    </div>
  );
}

