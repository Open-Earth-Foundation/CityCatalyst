'use client'

import { NavigationBar } from "@/components/navigation-bar";
import { Link } from "@chakra-ui/next-js";
import { Button, FormControl, FormErrorMessage, FormLabel, Heading, Input, Text } from "@chakra-ui/react";
import Image from 'next/image'
import { useForm, SubmitHandler, Controller } from "react-hook-form";

type Inputs = {
  email: string;
  password: string;
};

export default function Login() {
  const { register, handleSubmit, formState: { errors }, control } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = (data) => console.log(data);

  return (
    <main>
      <NavigationBar />
      <div className="flex flex-row">
        <Image src="/path_vector_login.svg" width={0} height={0} sizes="100vw 200px" alt="City roads" className="h-full w-[400px]" />
        <div className="w-full">
          <div className="pt-[148px] w-[445px] mx-auto">
            <Heading>Log In to City Catalyst</Heading>
            <Text className="my-4" color="#7A7B9A">Please enter your details to log in to your account</Text>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <FormControl isRequired>
                <FormLabel>Email address</FormLabel>
                <Controller
                  name="email"
                  control={control}
                  rules={{
                    required: true,
                  }}
                  render={({ field }) => (
                    <Input type="email" placeholder="e.g. youremail@domain.com" {...field} aria-required={true} />
                  )}
                />
                {errors.email && <FormErrorMessage>Email is required.</FormErrorMessage>}
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Password</FormLabel>
                <Controller
                  name="password"
                  control={control}
                  rules={{
                    required: true,
                  }}
                  render={({ field }) => (
                    <Input type="password" placeholder="········" {...field} aria-required={true} />
                  )}
                />
                {errors.email && <FormErrorMessage>Email is required.</FormErrorMessage>}
              </FormControl>
              <div className="w-full text-rigat">
                <Link href="/forgot-password" color="#2351DC">Forgot password</Link>
              </div>
              <Button type="submit" color="white" className="w-full bg-[#2351DC] uppercase rounded-[50px] h-16">Log in</Button>
            </form>
            <Text className="w-full text-center mt-4 font-font text-sm" color="#7A7B9A">
              Don't have an account?{' '}
              <Link href="/signup" color="#2351DC">Sign up</Link>
            </Text>
          </div>
        </div>
      </div>
    </main>
  )
}
