import { ViewIcon, ViewOffIcon, WarningIcon } from "@chakra-ui/icons";
import {
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  InputGroup,
  InputRightElement,
  List,
  ListIcon,
  ListItem,
  Text,
} from "@chakra-ui/react";
import { useState } from "react";
import { FieldError } from "react-hook-form";
import { CheckListIcon, CloseListIcon } from "./icons";

export default function PasswordInput({
  children,
  error,
  register,
  t,
  name = t("password"),
  id = "password",
  w,
  shouldValidate = false,
  watchPassword = "",
}: {
  children?: React.ReactNode;
  error: FieldError | undefined;
  register: Function;
  t: Function;
  name?: String;
  id?: String;
  w?: string;
  shouldValidate?: boolean;
  watchPassword?: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const handlePasswordVisibility = () => setShowPassword(!showPassword);

  // Password checks
  const password = watchPassword || "";
  const hasLowercase = /[a-z]/.test(password);
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  // overal validity
  const isPasswordValid =
    hasMinLength && hasLowercase && hasUppercase && hasNumber && hasSpecial;
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
                  hasMinLength: (value: string) =>
                    value.length >= 8 || t("password-min-length"),
                  hasUpperCase: (value: string) =>
                    /[A-Z]/.test(value) || t("password-upper-case"),
                  hasLowerCase: (value: string) =>
                    /[a-z]/.test(value) || t("password-lower-case"),
                  hasNumber: (value: string) =>
                    /[0-9]/.test(value) || t("password-number"),
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
      {/* Password Checklist */}
      {shouldValidate && (
        <List spacing={1} mt={2}>
          <ListItem display="flex" alignItems="center" gap="6px">
            <ListIcon
              as={hasMinLength ? CheckListIcon : CloseListIcon}
              color={
                hasMinLength
                  ? "sentiment.positiveDefault"
                  : "sentiment.negativeDefault"
              }
            />
            <Text
              color={
                hasMinLength ? "content.tertiary" : "sentiment.negativeDefault"
              }
              fontSize="body.md"
              letterSpacing="wide"
            >
              {t("password-min-length-check", { length: 8 })}
            </Text>
          </ListItem>
          <ListItem display="flex" alignItems="center" gap="6px">
            <ListIcon
              as={hasUppercase ? CheckListIcon : CloseListIcon}
              color={
                hasUppercase
                  ? "sentiment.positiveDefault"
                  : "sentiment.negativeDefault"
              }
            />
            <Text
              color={
                hasUppercase ? "content.tertiary" : "sentiment.negativeDefault"
              }
              fontSize="body.md"
              letterSpacing="wide"
            >
              {t("password-upper-case-check")}
            </Text>
          </ListItem>
          <ListItem display="flex" alignItems="center" gap="6px">
            <ListIcon
              as={hasLowercase ? CheckListIcon : CloseListIcon}
              color={
                hasLowercase
                  ? "sentiment.positiveDefault"
                  : "sentiment.negativeDefault"
              }
            />
            <Text
              color={
                hasLowercase ? "content.tertiary" : "sentiment.negativeDefault"
              }
              fontSize="body.md"
              letterSpacing="wide"
            >
              {t("password-lower-case-check")}
            </Text>
          </ListItem>
          <ListItem display="flex" alignItems="center" gap="6px">
            <ListIcon
              as={hasNumber ? CheckListIcon : CloseListIcon}
              color={
                hasNumber
                  ? "sentiment.positiveDefault"
                  : "sentiment.negativeDefault"
              }
            />
            <Text
              color={
                hasNumber ? "content.tertiary" : "sentiment.negativeDefault"
              }
              fontSize="body.md"
              letterSpacing="wide"
            >
              {t("password-number-check")}
            </Text>
          </ListItem>
        </List>
      )}
      {error && (
        <FormErrorMessage display="flex" gap="6px">
          <WarningIcon />
          <Text
            fontSize="body.md"
            lineHeight="20px"
            letterSpacing="wide"
            color="content.tertiary"
          >
            {t(error.message)}
          </Text>
        </FormErrorMessage>
      )}
    </FormControl>
  );
}
