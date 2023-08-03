'use client'

import { ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import { Link } from "@chakra-ui/next-js";
import { Button, FormControl, FormErrorMessage, FormLabel, Heading, Input, InputGroup, InputRightElement, Text } from "@chakra-ui/react";
import { useState } from "react";
import { useForm, SubmitHandler, Controller } from "react-hook-form";

type Inputs = {
  email: string;
  password: string;
};

export default function Login() {
  const { handleSubmit, register, formState: { errors, isSubmitting } } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = (data) => console.log(data);

  const [showPassword, setShowPassword] = useState(false);
  const handlePasswordVisibility = () => setShowPassword(!showPassword);

  return (
    <>
      <Heading>Log In to City Catalyst</Heading>
      <Text className="my-4" color="#7A7B9A">Please enter your details to log in to your account</Text>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormControl isInvalid={!!errors.email}>
          <FormLabel>Email address</FormLabel>
          <Input
            type="email"
            placeholder="e.g. youremail@domain.com"
            size="lg"
            {...register('email', {
              required: 'Email is required',
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
              placeholder="········"
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
        <div className="w-full text-right">
          <Link href="/forgot-password">Forgot password</Link>
        </div>
        <Button type="submit" isLoading={isSubmitting} h={16} width="full" className="bg-[#2351DC]">Log in</Button>
      </form>
      <Text className="w-full text-center mt-4 text-sm" color="#7A7B9A">
        Don't have an account?{' '}
        <Link href="/signup">Sign up</Link>
      </Text>
    </>
  );
}
