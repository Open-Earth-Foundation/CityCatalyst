'use client'

import { NavigationBar } from "@/components/navigation-bar";
import { ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import { Link } from "@chakra-ui/next-js";
import { Button, FormControl, FormErrorMessage, FormLabel, Heading, Icon, Input, InputGroup, InputRightElement, Text } from "@chakra-ui/react";
import Image from 'next/image'
import { useState } from "react";
import { useForm, SubmitHandler, Controller } from "react-hook-form";

type Inputs = {
  email: string;
  password: string;
};

export default function Login() {
  const { register, handleSubmit, formState: { errors }, control } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = (data) => console.log(data);

  const [showPassword, setShowPassword] = useState(false);
  const handlePasswordVisibility = () => setShowPassword(!showPassword);

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
                    <Input type="email" placeholder="e.g. youremail@domain.com" size="md" {...field} aria-required={true} />
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
                    <InputGroup>
                      <Input type={showPassword ? 'text' : 'password'} size="md" placeholder="········" {...field} aria-required={true} />
                      <InputRightElement width="3rem">
                        <Button h="2rem" size="sm" onClick={handlePasswordVisibility}>
                          {showPassword ? <ViewOffIcon /> : <ViewIcon />}
                        </Button>
                      </InputRightElement>
                    </InputGroup>
                  )}
                />
                {errors.email && <FormErrorMessage>Email is required.</FormErrorMessage>}
              </FormControl>
              <div className="w-full text-right">
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
