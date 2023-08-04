import { emailPattern } from "@/util/validation";
import { FormControl, FormErrorMessage, FormLabel, Input } from "@chakra-ui/react";
import { FieldError } from "react-hook-form";

export default function EmailInput({
  children,
  error,
  register,
  name = 'Email address',
  id = 'email',
}: {
  children?: React.ReactNode,
  error: FieldError | undefined,
  register: Function,
  name?: String,
  id?: String,
}) {
  return (
    <FormControl isInvalid={!!error}>
      <FormLabel>{name}</FormLabel>
      <Input
        type="email"
        formNoValidate
        placeholder="e.g. youremail@domain.com"
        size="lg"
        {...register(id, {
          required: 'Email is required',
          pattern: {
            value: emailPattern,
            message: 'Please enter a valid email address',
          },
        })}
      />
      {children}
      <FormErrorMessage>{error && error.message}</FormErrorMessage>
    </FormControl>
  );
}

