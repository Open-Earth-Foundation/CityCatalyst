'use client'

import { Button, Heading, Text } from "@chakra-ui/react";
import { useRouter, useSearchParams } from 'next/navigation';
import { Link } from '@chakra-ui/next-js';

export default function CheckEmail() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email');

  const emailSection = email ? (
    <>At <Link href={`mailto://${email}`}>{email}</Link></>
  ) : 'In your inbox';

  return (
    <>
      <Heading size="xl">Check Your Email</Heading>
      <Text className="my-4" color="#7A7B9A">Thank you for creating your City Catalyst account!</Text>
      <Text className="my-4" color="#7A7B9A">{emailSection}, you will receive an email with instructions and credentials for your new account. If you do not receive it, please check your spam folder.</Text>
      <Button
        as="a"
        h={16}
        width="full"
        className="bg-[#2351DC]"
        mt={4}
        onClick={() => router.push('/login')}
      >
        Back to Log In
      </Button>
    </>
  );
}

