import { RadioGroup as ChakraRadioGroup } from "@chakra-ui/react";
import * as React from "react";

import { Box, Icon } from "@chakra-ui/react";
import { InventoryButtonCheckIcon } from "../icons";

export interface RadioProps extends ChakraRadioGroup.ItemProps {
  rootRef?: React.Ref<HTMLDivElement>;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}

export const RadioGroup = ChakraRadioGroup.Root;

export const CustomRadio = React.forwardRef<HTMLInputElement, RadioProps>(
  function Radio(props, ref) {
    const { children, inputProps, rootRef, ...rest } = props;

    return (
      <ChakraRadioGroup.Item ref={rootRef} {...rest}>
        <ChakraRadioGroup.ItemHiddenInput ref={ref} {...inputProps} />
        <ChakraRadioGroup.ItemIndicator />
        <Box
          cursor={props.disabled ? "not-allowed" : "pointer"}
          w="181px"
          h="56px"
          borderRadius="lg"
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
          borderWidth="1px"
          borderColor="border.neutral"
          bg="base.light"
          color="content.secondary"
          _checked={{
            bg: "background.neutral",
            color: "content.link",
            borderWidth: "0",
            borderColor: "interactive.secondary",
          }}
          _focus={{
            boxShadow: "outline",
          }}
        >
          {inputProps?.checked && <Icon as={InventoryButtonCheckIcon} />}
          {children && (
            <ChakraRadioGroup.ItemText>{children}</ChakraRadioGroup.ItemText>
          )}
        </Box>
      </ChakraRadioGroup.Item>
    );
  },
);
