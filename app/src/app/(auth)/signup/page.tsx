'use client'

import { emailPattern } from "@/util/validation";
import { ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import { Link } from "@chakra-ui/next-js";
import { Button, Checkbox, FormControl, FormErrorMessage, FormLabel, Heading, Input, InputGroup, InputRightElement, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

  const [showPassword, setShowPassword] = useState(false);
  const handlePasswordVisibility = () => setShowPassword(!showPassword);

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
        <FormControl isInvalid={!!errors.email}>
          <FormLabel>Email address</FormLabel>
          <Input
            type="email"
            formNoValidate
            placeholder="e.g. youremail@domain.com"
            size="lg"
            {...register('email', {
              required: 'Email is required',
              pattern: {
                value: emailPattern,
                message: 'Please enter a valid email address',
              },
            })}
          />
          <FormErrorMessage>{errors.email && errors.email.message}</FormErrorMessage>
        </FormControl>
        <FormControl isInvalid={!!errors.password}>
          <FormLabel>Password</FormLabel>
          <InputGroup>
            <Input
              type={showPassword ? 'text' : 'password'}
              size="lg"
              placeholder={showPassword ? 'Password' : '········'}
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 4, message: 'Minimum length should be 4' },
              })}
            />
            <InputRightElement width="3rem" mr={2}>
              <Button h="2rem" size="md" mt={2} onClick={handlePasswordVisibility} variant="ghost">
                {showPassword ? <ViewOffIcon color="#7A7B9A" /> : <ViewIcon color="#7A7B9A" />}
              </Button>
            </InputRightElement>
          </InputGroup>
          <FormErrorMessage>
            {errors.password && errors.password.message}
          </FormErrorMessage>
        </FormControl>
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
