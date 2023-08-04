'use client'

import { ArrowBackIcon } from "@chakra-ui/icons";
import { Button, Card, Heading, Input, InputGroup, Text } from "@chakra-ui/react";
import NextLink from 'next/link';
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

type Inputs = {
  city: String;
  year: number;
}

export default function OnboardingSetup() {
  const router = useRouter();
  const { handleSubmit, register, formState: { errors, isSubmitting } } = useForm<Inputs>();

  return (
    <>
      <Button
        variant="ghost"
        leftIcon={<ArrowBackIcon boxSize={6} />}
        onClick={() => router.back()}
      >
        Go Back
      </Button>
      <div className="flex flex-col md:flex-row">
        <div>
          <Heading size="xl">Select City and Year</Heading>
          <Text className="my-4" color="description">
          <Text className="my-4" color="tertiary">
            Please select the city and year for which you want to create your emissions inventory
          </Text>
        </div>
        <div>
          <Card>
            <form>
              <InputGroup>
                <Input />
              </InputGroup>

            </form>

          </Card>

        </div>

      </div>
      <NextLink href="/onboarding/setup" passHref legacyBehavior>
        <Button as="a" h={16} width="full" mt={4}>
          Start City Inventory Profile
        </Button>
      </NextLink>
    </>
  );
}

