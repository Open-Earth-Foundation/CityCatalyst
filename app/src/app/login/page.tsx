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
  const { handleSubmit, formState: { errors }, control } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = (data) => console.log(data);

  const [showPassword, setShowPassword] = useState(false);
  const handlePasswordVisibility = () => setShowPassword(!showPassword);

  return (
    <main className="h-screen">
      <NavigationBar />
      <div className="flex flex-row items-stretch h-full">
        <div className="bg-[#02061c] h-full">
          <Image src="/path_vector_login.svg" width={0} height={0} sizes="100vw 200px" alt="City roads" className="w-[400px]" />
        </div>
        <div className="w-full">
          <div className="pt-[148px] w-[445px] mx-auto">
            <Heading>Log In to City Catalyst</Heading>
            <Text className="my-4" color="#7A7B9A">Please enter your details to log in to your account</Text>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <FormControl>
                <FormLabel>Email address</FormLabel>
                <Controller
                  name="email"
                  control={control}
                  rules={{
                    required: true,
                  }}
                  render={({ field }) => (
                    <Input type="email" placeholder="e.g. youremail@domain.com" size="lg" {...field} aria-required={true} />
                  )}
                />
                {errors.email && <FormErrorMessage>Email is required.</FormErrorMessage>}
              </FormControl>
              <FormControl>
                <FormLabel>Password</FormLabel>
                <Controller
                  name="password"
                  control={control}
                  rules={{
                    required: true,
                  }}
                  render={({ field }) => (
                    <InputGroup>
                      <Input type={showPassword ? 'text' : 'password'} size="lg" placeholder="········" {...field} aria-required={true} />
                      <InputRightElement width="3rem" mr={2}>
                        <Button h="2rem" size="md" mt={2} onClick={handlePasswordVisibility} variant="ghost">
                          {showPassword ? <ViewOffIcon color="#7A7B9A" /> : <ViewIcon color="#7A7B9A" />}
                        </Button>
                      </InputRightElement>
                    </InputGroup>
                  )}
                />
                {errors.password && <FormErrorMessage>Password is required.</FormErrorMessage>}
              </FormControl>
              <div className="w-full text-right">
                <Link href="/forgot-password">Forgot password</Link>
              </div>
              <Button type="submit" h={16} width="full" className="bg-[#2351DC]">Log in</Button>
            </form>
            <Text className="w-full text-center mt-4 text-sm" color="#7A7B9A">
              Don't have an account?{' '}
              <Link href="/signup">Sign up</Link>
            </Text>
          </div>
        </div>
      </div>
    </main>
  )
}
