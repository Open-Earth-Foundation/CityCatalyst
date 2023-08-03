'use client'

import { Button, Heading, Text } from "@chakra-ui/react";
import { useSearchParams } from 'next/navigation';
import { Link } from '@chakra-ui/next-js';
import NextLink from 'next/link';

export default function CheckEmail() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email');

  const emailSection = email ? (
    <>At <Link href={`mailto:${email}`}>{email}</Link></>
  ) : 'In your inbox';

  return (
    <>
      <Heading size="xl">Check Your Email</Heading>
      <Text className="my-4" color="#7A7B9A">Thank you for creating your City Catalyst account!</Text>
      <Text className="my-4" color="#7A7B9A">{emailSection}, you will receive an email with instructions and credentials for your new account. If you do not receive it, please check your spam folder.</Text>
      <NextLink href="/login" passHref legacyBehavior>
        <Button as="a" h={16} width="full" mt={4}>
          Back to Log In
        </Button>
      </NextLink>
    </>
  );
}

