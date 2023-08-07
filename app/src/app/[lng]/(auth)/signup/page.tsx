'use client'

import EmailInput from "@/components/email-input";
import PasswordInput from "@/components/password-input";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import { Link } from "@chakra-ui/next-js";
import { Button, Checkbox, FormControl, FormErrorMessage, FormHelperText, FormLabel, Heading, Input, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";

type Inputs = {
  name: string;
  email: string;
  password: string;
  acceptTerms: boolean;
};

export default function Signup() {
  const router = useRouter();
  const { handleSubmit, register, formState: { errors, isSubmitting } } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    console.log(data);
    await new Promise(resolve => setTimeout(resolve, 2000));
    router.push(`/check-email?email=${data.email}`);
  };

  return (
    <>
      <Heading size="xl">Sign Up to City Catalyst</Heading>
      <Text className="my-4" color="#7A7B9A">Please enter your details to create your account</Text>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormControl isInvalid={!!errors.name}>
          <FormLabel>Full name</FormLabel>
          <Input
            type="text"
            placeholder="Your full name"
            size="lg"
            {...register('name', {
              required: 'Name is required',
              minLength: { value: 4, message: 'Minimum length should be 4' },
            })}
          />
          <FormErrorMessage>{errors.name && errors.name.message}</FormErrorMessage>
        </FormControl>
        <EmailInput register={register} error={errors.email} />
        <PasswordInput register={register} error={errors.password}>
          <FormHelperText><InfoOutlineIcon color="#2351DC" />{' '}Must contain uppercase, lowercase letters and number</FormHelperText>
        </PasswordInput>
        <FormControl isInvalid={!!errors.acceptTerms}>
          <Checkbox
            color="#7A7B9A"
            size="md"
            {...register('acceptTerms', {
              required: 'Please accept the terms and conditions in order to sign up',
            })}
          >
            Accept <Link href="/terms" className="underline">Terms and conditions</Link>
          </Checkbox>
          <FormErrorMessage>
            {errors.acceptTerms && errors.acceptTerms.message}
          </FormErrorMessage>
        </FormControl>
        <Button type="submit" isLoading={isSubmitting} h={16} width="full" className="bg-[#2351DC]">Create Account</Button>
      </form>
      <Text className="w-full text-center mt-4 text-sm" color="#7A7B9A">
        Already have an account?{' '}
        <Link href="/login" className="underline">Log In</Link>
      </Text>
    </>
  );
}
