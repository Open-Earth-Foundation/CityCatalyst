'use client'

import EmailInput from "@/components/email-input";
import { Button, Heading, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { SubmitHandler, useForm } from "react-hook-form";

type Inputs = {
  email: string;
};

export default function ForgotPassword() {
  const router = useRouter();
  const { handleSubmit, register, formState: { errors, isSubmitting } } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    console.log(data);
    await new Promise(resolve => setTimeout(resolve, 2000));
    router.push(`/check-email?email=${data.email}&reset=true`);
  };

  return (
    <>
      <Heading size="xl">Forgot Password?</Heading>
      <Text my={4} color="#7A7B9A">Enter the email address you used when you joined and we'll send you instructions to reset your password.</Text>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <EmailInput register={register} error={errors.email} />
        <Button type="submit" isLoading={isSubmitting} h={16} width="full" mt={4}>
          Reset Password
        </Button>
        <Button type="reset" disabled={isSubmitting} variant="ghost" h={16} width="full" mt={4} onClick={() => router.back()}>
          Cancel
        </Button>
      </form>
    </>
  );
}

