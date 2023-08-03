'use client'

import { ArrowForwardIcon } from "@chakra-ui/icons";
import { Button, Heading, Text } from "@chakra-ui/react";
import NextLink from 'next/link';

export default function ResetSuccessful() {
  return (
    <>
      <Heading size="xl">Password Reset</Heading>
      <Text className="my-4" color="#7A7B9A">
        Your password has been successfully updated.
        <br/ >
        Click below to Log In magically.
      </Text>
      <NextLink href="/" passHref legacyBehavior>
        <Button as="a" h={16} width="full" mt={4}>
          Continue <ArrowForwardIcon ml={2} boxSize={6} />
        </Button>
      </NextLink>
    </>
  );
}

