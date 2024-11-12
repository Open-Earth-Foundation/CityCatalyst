import { Box, Icon, useRadio, UseRadioProps } from "@chakra-ui/react";
import { InventoryButtonCheckIcon } from "./icons";

interface CustomRadioProps extends UseRadioProps {
  children: React.ReactNode;
}

export function CustomRadioButtons(props: CustomRadioProps) {
  const { getInputProps, getRadioProps } = useRadio(props);

  return (
    <Box as="label">
      <input {...getInputProps()} hidden />
      <Box
        {...getRadioProps()}
        cursor={props.isDisabled ? "not-allowed" : "pointer"}
        w="181px"
        h="56px"
        borderRadius="full"
        display="flex"
        justifyContent="center"
        alignItems="center"
        fontFamily="heading"
        fontStyle="500"
        textTransform="uppercase"
        lineHeight="20px"
        gap="8px"
        letterSpacing="wide"
        className="transition-all duration-150"
        borderWidth={props.isChecked ? "0" : "1px"}
        borderColor={props.isChecked ? "green.500" : "border.neutral"}
        bg={props.isChecked ? "background.neutral" : "base.light"}
        color={props.isChecked ? "content.link" : "content.secondary"}
        _checked={{
          bg: "background.neutral",
          color: "content.link",
          borderWidth: "1px",
          borderColor: "interactive.secondary",
        }}
        _focus={{
          boxShadow: "outline",
        }}
      >
        {props.isChecked ? <Icon as={InventoryButtonCheckIcon} /> : ""}
        {props.children}
      </Box>
    </Box>
  );
}
