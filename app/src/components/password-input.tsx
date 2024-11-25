import { passwordRegex } from "@/util/validation";
import { ViewIcon, ViewOffIcon, WarningIcon } from "@chakra-ui/icons";
import {
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  InputGroup,
  InputRightElement,
  Text,
} from "@chakra-ui/react";
import { useState } from "react";
import { FieldError } from "react-hook-form";

export default function PasswordInput({
  children,
  error,
  register,
  t,
  name = t("password"),
  id = "password",
  w,
  shouldValidate = false,
}: {
  children?: React.ReactNode;
  error: FieldError | undefined;
  register: Function;
  t: Function;
  name?: String;
  id?: String;
  w?: string;
  shouldValidate?: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const handlePasswordVisibility = () => setShowPassword(!showPassword);

  return (
    <FormControl isInvalid={!!error} w={w}>
      <FormLabel>{name}</FormLabel>
      <InputGroup>
        <Input
          type={showPassword ? "text" : "password"}
          size="lg"
          shadow="2dp"
          background={
            error ? "sentiment.negativeOverlay" : "background.default"
          }
          placeholder={showPassword ? t("password") : "········"}
          {...register(id, {
            required: t("password-required"),
            minLength: { value: 4, message: t("min-length", { length: 4 }) },
            pattern: shouldValidate
              ? {
                  value: passwordRegex,
                  message: t("password-invalid"),
                }
              : undefined,
          })}
        />
        <InputRightElement width="3rem" mr={2}>
          <Button
            h="2rem"
            size="md"
            mt={2}
            onClick={handlePasswordVisibility}
            variant="ghost"
          >
            {showPassword ? (
              <ViewOffIcon color="#7A7B9A" />
            ) : (
              <ViewIcon color="#7A7B9A" />
            )}
          </Button>
        </InputRightElement>
      </InputGroup>
      {children}
      {error && (
        <FormErrorMessage display="flex" gap="6px">
          <WarningIcon />
          <Text
            fontSize="body.md"
            lineHeight="20px"
            letterSpacing="wide"
            color="content.tertiary"
          >
            {error.message}
          </Text>
        </FormErrorMessage>
      )}
    </FormControl>
  );
}
