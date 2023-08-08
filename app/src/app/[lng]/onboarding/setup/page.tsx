'use client'

import WizardSteps from "@/components/wizard-steps";
import { ArrowBackIcon, SearchIcon } from "@chakra-ui/icons";
import { Box, Button, Card, FormControl, FormErrorMessage, FormLabel, Heading, Input, InputGroup, InputLeftElement, Select, Text, useSteps } from "@chakra-ui/react";
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

  const steps = [{ title: 'Setting up your Inventory' }, { title: 'Confirm City\'s information' }];
  const { activeStep, goToNext, goToPrevious } = useSteps({
    index: 0,
    count: steps.length,
  });

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    // TODO save data
    console.log(data);
    await new Promise(resolve => setTimeout(resolve, 2000));
    goToNext();
  };
  const years = Array.from({ length: 10 }, (_x, i) => 2020 + i);

  return (
    <>
      <div className="pt-[64px] w-[1090px] max-w-full mx-auto px-8">
        <Button
          variant="ghost"
          leftIcon={<ArrowBackIcon boxSize={6} />}
          onClick={() => router.back()}
        >
          Go Back
        </Button>
        <div className="w-full flex justify-center">
          <div className="w-[800px]">
            <WizardSteps
              steps={steps}
              currentStep={activeStep}
            />
          </div>
        </div>
        <div className="flex flex-col md:flex-row md:space-x-12 md:space-y-0 space-y-12 align-top mb-24 mt-[112px]">
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
                      w={441}
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
                  <Select
                    placeholder="Select year"
                    size="lg"
                    {...register('year', {
                      required: 'Year is required',
                    })}
                  >
                    {years.map((year: number, i: number) => (
                      <option value={year} key={i}>{year}</option>
                    ))}
                  </Select>
                  <FormErrorMessage>{errors.year && errors.year.message}</FormErrorMessage>
                </FormControl>
              </form>
            </Card>
            <Text color="tertiary" mt={6} fontSize="sm">Only GPC Basic Inventories are supported momentarily</Text>
          </div>

        </div>
        <div className="bg-white w-full fixed bottom-0 left-0 border-t-4 border-brand flex flex-row py-8 px-8 drop-shadow-2xl hover:drop-shadow-4xl transition-all">
          <Box className="w-full">
            <Text fontSize="sm">Step {activeStep + 1}</Text>
            <Text fontSize="2xl" as="b">{steps[activeStep].title}</Text>
          </Box>
          {activeStep > 0 && (
            <Button h={16} onClick={() => goToPrevious()} w={400} variant="ghost" leftIcon={<SearchIcon />} size="sm" px={12} mr={6}>
              Search for another City
            </Button>
          )}
          <Button h={16} isLoading={isSubmitting} onClick={() => handleSubmit(onSubmit)()} px={12} size="sm">
            Save and Continue
          </Button>
        </div>
      </div>
    </>
  );
}

