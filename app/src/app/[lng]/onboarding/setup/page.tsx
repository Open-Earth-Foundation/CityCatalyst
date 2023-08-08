'use client'

import WizardSteps from "@/components/wizard-steps";
import { ArrowBackIcon, InfoOutlineIcon, SearchIcon } from "@chakra-ui/icons";
import { Box, Button, Card, Flex, FormControl, FormErrorMessage, FormLabel, Heading, Icon, Input, InputGroup, InputLeftElement, Select, Text, useSteps } from "@chakra-ui/react";
import Image from 'next/image';
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FieldErrors, SubmitHandler, UseFormRegister, useForm } from "react-hook-form";
import { MdOutlineAspectRatio, MdOutlinePeopleAlt } from 'react-icons/md';

type Inputs = {
  city: String;
  year: number;
}

function SetupStep({ errors, register }: { errors: FieldErrors<Inputs>, register: UseFormRegister<Inputs> }) {
  const years = Array.from({ length: 10 }, (_x, i) => 2020 + i);
  return (
    <>
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
    </>
  );
}

function ConfirmStep({ cityName }: { cityName: String }) {
  return (
    <>
      <div>
        <Heading size="lg">Confirm City's Information</Heading>
        <Text className="my-4" color="tertiary">
          Review and confirm this information about your city. If there is an error please send us an email to edit it.
        </Text>
        <Text className="my-4" color="tertiary">
          We use <Link href="https://openclimate.org">open data sources</Link> to pre-fill the city profile.
        </Text>
      </div>
      <div>
        <Card px={6} py={8}>
          <Heading fontSize="xl" color="brand">
            {cityName}
          </Heading>
          <Flex w={441} mt={12} justify="space-between">
            <div>
              <Icon as={MdOutlinePeopleAlt} boxSize={6} mt={1} mr={2} />
              <Box>
                <Text fontSize="xl">
                  3,978.9M
                  <InfoOutlineIcon boxSize={4} mt={-0.5} ml={1} color="brand" />
                </Text>
                <Text fontSize="xs">Total population</Text>
              </Box>
            </div>
            <div>
              <Icon as={MdOutlineAspectRatio} boxSize={6} mt={1} mr={2} />
              <Box>
                <Text fontSize="xl">
                  782Km<sup>2</sup>
                  <InfoOutlineIcon boxSize={4} mt={-0.5} ml={1} color="brand" />
                </Text>
                <Text fontSize="xs">Total land area</Text>
              </Box>
            </div>
          </Flex>
          <Text mb={4} mt={7}>Geographical boundaries</Text>
          <Image src="/assets/map_placeholder.png" width={441} height={200} alt="City placeholder image" className="object-cover" />
        </Card>
      </div>
    </>
  );
}

export default function OnboardingSetup() {
  const router = useRouter();
  const { handleSubmit, register, getValues, formState: { errors, isSubmitting } } = useForm<Inputs>();

  const steps = [{ title: 'Setting up your Inventory' }, { title: 'Confirm City\'s information' }];
  const { activeStep, goToNext, goToPrevious } = useSteps({
    index: 0,
    count: steps.length,
  });

  const [data, setData] = useState({});
  const [isConfirming, setConfirming] = useState(false);

  const onSubmit: SubmitHandler<Inputs> = async (newData) => {
    // TODO persist data in local storage and jump to step 2 on reload?
    console.log(newData);
    setData(newData);
    await new Promise(resolve => setTimeout(resolve, 500));
    goToNext();
  };

  const onConfirm = async () => {
    // TODO actually save data in backend here
    setConfirming(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setConfirming(false);
    router.push('/onboarding/done');
  }

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
          {activeStep == 0 && <SetupStep errors={errors} register={register} />}
          {activeStep == 1 && <ConfirmStep cityName={getValues('city')} />}
        </div>
        <div className="bg-white w-full fixed bottom-0 left-0 border-t-4 border-brand flex flex-row py-8 px-8 drop-shadow-2xl hover:drop-shadow-4xl transition-all">
          <Box className="w-full">
            <Text fontSize="sm">Step {activeStep + 1}</Text>
            <Text fontSize="2xl" as="b">{steps[activeStep]?.title}</Text>
          </Box>
          {activeStep == 0 ? (
            <Button h={16} isLoading={isSubmitting} onClick={() => handleSubmit(onSubmit)()} px={12} size="sm">
              Save and Continue
            </Button>
          ) : (
            <>
              <Button h={16} onClick={() => goToPrevious()} w={400} variant="ghost" leftIcon={<SearchIcon />} size="sm" px={12} mr={6}>
                Search for another City
              </Button>
              <Button h={16} isLoading={isConfirming} px={12} onClick={onConfirm} size="sm">
                Confirm and Continue
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

