'use client'

import { ArrowForwardIcon } from "@chakra-ui/icons";
import { Button, Card, Flex, Heading, Text } from "@chakra-ui/react";
import Image from 'next/image';
import NextLink from 'next/link';

export default function Onboarding() {
  // TODO load these from the API
  const cityName = 'Ciudad Autónoma de Buenos Aires';
  const year = '2023';

  return (
    <div className="pt-[148px] w-[1024px] max-w-full mx-auto px-4 flex flex-col items-center">
      <Image src="/assets/check-circle.svg" width={64} height={64} alt="Checkmark" />
      <Heading size="xl" mt={12} mb={20}>Your City Inventory Profile<br />Was Successfully Created</Heading>
      <Card w="full" px={6} py={8}>
        <Flex direction="row">
          <div className="rounded-full bg-brand w-8 h-8 mr-4 flex-grow-0" />
          <div className="max-w-full flex-shrink-1 space-y-4">
            <Heading fontSize="2xl">{cityName}</Heading>
            <Heading fontSize="lg">GPC Basic Emission Inventory - Year {year}</Heading>
            <Text color="tertiary">
              You created your city profile to start your GPC Basic GHG inventory.<br/>Also, we found for your city 10+ external datasets that you can connect to complete your inventory.
            </Text>
          </div>
        </Flex>
      </Card>
      <div className="self-end">
        <NextLink href="/" passHref legacyBehavior>
          <Button as="a" h={16} px={6} mt={12} rightIcon={<ArrowForwardIcon boxSize={6} />}>
            Check Dashboard
          </Button>
        </NextLink>
      </div>
    </div>
  );
}

