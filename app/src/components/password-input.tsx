import { ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import { Button, FormControl, FormErrorMessage, FormLabel, Input, InputGroup, InputRightElement } from "@chakra-ui/react";
import { useState } from "react";
import { FieldError } from "react-hook-form";

export default function PasswordInput({
  children,
  error,
  register,
  name = 'Password',
  id = 'password',
}: {
  children?: React.ReactNode,
  error: FieldError | undefined,
  register: Function,
  name?: String,
  id?: String,
}) {
  const [showPassword, setShowPassword] = useState(false);
  const handlePasswordVisibility = () => setShowPassword(!showPassword);

  return (
    <FormControl isInvalid={!!error}>
      <FormLabel>{name}</FormLabel>
      <InputGroup>
        <Input
          type={showPassword ? 'text' : 'password'}
          size="lg"
          placeholder={showPassword ? 'Password' : '········'}
          {...register(id, {
            required: `${name} is required`,
            minLength: { value: 4, message: 'Minimum length should be 4' },
          })}
        />
        <InputRightElement width="3rem" mr={2}>
          <Button h="2rem" size="md" mt={2} onClick={handlePasswordVisibility} variant="ghost">
            {showPassword ? <ViewOffIcon color="#7A7B9A" /> : <ViewIcon color="#7A7B9A" />}
          </Button>
        </InputRightElement>
      </InputGroup>
      {children}
      <FormErrorMessage>
        {error && error.message}
      </FormErrorMessage>
    </FormControl>
  );
}

