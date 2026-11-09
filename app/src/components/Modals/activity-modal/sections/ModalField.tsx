import { Box, Icon, Text } from "@chakra-ui/react";
import * as React from "react";
import { MdKeyboardArrowDown, MdWarning } from "react-icons/md";
import { Field, FieldProps } from "@/components/ui/field";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";

export const MODAL_INPUT_HEIGHT = "48px";

/** Shared label style (and red asterisk) for every input of the activity modal. */
export const ModalLabel = ({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) => (
  <Text
    as="span"
    fontSize="label.lg"
    fontStyle="normal"
    fontWeight="medium"
    letterSpacing="wide"
    fontFamily="heading"
  >
    {children}
    {required && (
      <Text as="span" color="fg.error" ml={1}>
        *
      </Text>
    )}
  </Text>
);

/** `Field` that renders its label with `ModalLabel`. Pass `required` to show the asterisk. */
export const ModalField = ({
  label,
  required,
  ...rest
}: FieldProps & { required?: boolean }) => (
  <Field
    {...rest}
    labelColor="inherit"
    label={
      label ? <ModalLabel required={required}>{label}</ModalLabel> : undefined
    }
  />
);

export const ModalSectionTitle = ({
  children,
  ...rest
}: React.ComponentProps<typeof Text>) => (
  <Text
    w="full"
    fontSize="title.md"
    fontWeight="semibold"
    fontFamily="heading"
    mb={4}
    {...rest}
  >
    {children}
  </Text>
);

export const ModalFieldError = ({ message }: { message?: string }) => (
  <Box data-modal-error display="flex" gap="6px" alignItems="center" mt="6px">
    <Icon as={MdWarning} color="sentiment.negativeDefault" />
    <Text fontSize="body.md" color="sentiment.negativeDefault">
      {message}
    </Text>
  </Box>
);

interface ModalSelectProps extends React.ComponentProps<
  typeof NativeSelectField
> {
  invalid?: boolean;
  disabled?: boolean;
}

/** Native select with the chevron, the shared height and a single border. */
export const ModalSelect = React.forwardRef<
  HTMLSelectElement,
  ModalSelectProps
>(function ModalSelect(
  { invalid, disabled, placeholder, children, ...rest },
  ref,
) {
  // uncontrolled selects must start on the (disabled) placeholder option
  const initialValue =
    rest.value === undefined && rest.defaultValue === undefined
      ? { defaultValue: "" }
      : {};
  return (
    <NativeSelectRoot
      w="full"
      disabled={disabled}
      icon={<Icon as={MdKeyboardArrowDown} color="fg.muted" />}
    >
      <NativeSelectField
        ref={ref}
        {...({ disabled } as object)}
        h={MODAL_INPUT_HEIGHT}
        border="inputBox"
        borderRadius="4px"
        shadow="1dp"
        bgColor="base.light"
        background={invalid ? "sentiment.negativeOverlay" : undefined}
        borderColor={invalid ? "sentiment.negativeDefault" : undefined}
        _focus={{
          shadow: "none",
          borderColor: "content.link",
        }}
        css={{
          "&:has(option[value='']:checked)": { color: "fg.muted" },
          "& option": { color: "initial" },
        }}
        {...initialValue}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled hidden>
            {placeholder}
          </option>
        )}
        {children}
      </NativeSelectField>
    </NativeSelectRoot>
  );
});

/** Props shared by the text inputs of the modal. */
export const modalInputProps = (invalid: boolean) => ({
  h: MODAL_INPUT_HEIGHT,
  border: "inputBox",
  borderRadius: "4px",
  shadow: "1dp",
  bgColor: "base.light",
  background: invalid ? "sentiment.negativeOverlay" : undefined,
  borderColor: invalid ? "sentiment.negativeDefault" : undefined,
  _focus: {
    shadow: "none",
    borderColor: "content.link",
  },
});
