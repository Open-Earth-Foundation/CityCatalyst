'use client'

import { ArrowBackIcon, SearchIcon } from "@chakra-ui/icons";
import { Button, Card, FormControl, FormErrorMessage, FormLabel, Heading, Input, InputGroup, InputLeftElement, Select, Text } from "@chakra-ui/react";
import NextLink from 'next/link';
import { useRouter } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";

type Inputs = {
  city: String;
  year: number;
}

export default function OnboardingSetup() {
  const router = useRouter();
  const { handleSubmit, register, formState: { errors, isSubmitting } } = useForm<Inputs>();

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    // TODO save data
    console.log(data);
    await new Promise(resolve => setTimeout(resolve, 2000));
    router.push(`/onboarding/confirm`);
  };
  const years = Array.from({length: 10}, (x, i) => 2020 + i);

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
          <Text className="my-4" color="tertiary">
            Please select the city and year for which you want to create your emissions inventory
          </Text>
        </div>
        <div>
          <Card p={6}>
            <form>
              <FormControl isInvalid={!!errors.city} mb={12}> 
                <FormLabel>Select city</FormLabel>
                <InputGroup>
                  <InputLeftElement pointerEvents='none'>
                    <SearchIcon color="tertiary" boxSize={4} mt={2} ml={4} />
                  </InputLeftElement>
                  <Input
                    type="text"
                    placeholder="Search by city"
                    size="lg"
                    {...register('city', {
                      required: 'City is required',
                    })}
                  />
                </InputGroup>
                <FormErrorMessage>{errors.city && errors.city.message}</FormErrorMessage>
              </FormControl>
              <FormControl isInvalid={!!errors.year}>
                <FormLabel>Inventory year</FormLabel>
                <Select placeholder="Select year" {...register('year', {
                  required: 'Year is required',
                })}>
                  {years.map((year: number) => (
                    <option value={year}>{year}</option>
                  ))}
                </Select>
                <FormErrorMessage>{errors.year && errors.year.message}</FormErrorMessage>
              </FormControl>
            </form>
          </Card>
          <Text color="tertiary" mt={6} fontSize="sm">Only GPC Basic Inventories are supported momentarily</Text>
        </div>

      </div>
      <NextLink href="/onboarding/setup" passHref legacyBehavior>
        <Button as="a" h={16} width="full" mt={4} isLoading={isSubmitting} onClick={() => handleSubmit(onSubmit)()}>
          Save and Continue
        </Button>
      </NextLink>
    </>
  );
}

