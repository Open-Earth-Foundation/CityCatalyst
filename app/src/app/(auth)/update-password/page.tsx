'use client'

import PasswordInput from "@/components/password-input";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import { Button, FormHelperText, Heading, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";

type Inputs = {
  password: string;
  confirmPassword: string;
};

export default function UpdatePassword() {
  const router = useRouter();
  const { handleSubmit, register, formState: { errors, isSubmitting }, setError } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    console.log(data);
    if (data.password !== data.confirmPassword) {
      setError('confirmPassword', { type: 'custom', message: 'Passwords don\'t match!' });
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
    router.push(`/reset-successful`);
  };

  return (
    <>
      <Heading size="xl">Update your Password</Heading>
      <Text className="my-4" color="#7A7B9A">Update your password. This is the one that you will use from now on.</Text>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <PasswordInput register={register} error={errors.password} name="New Password">
          <FormHelperText><InfoOutlineIcon color="#2351DC" />{' '}Must contain uppercase, lowercase letters and number</FormHelperText>
        </PasswordInput>
        <PasswordInput register={register} error={errors.confirmPassword} name="Confirm Password" id="confirmPassword" />
        <Button type="submit" isLoading={isSubmitting} h={16} width="full">
          Reset Password
        </Button>
        <Button type="reset" disabled={isSubmitting} variant="ghost" h={16} width="full" mt={4} onClick={() => router.back()}>
          Cancel
        </Button>
      </form>
    </>
  );
}

