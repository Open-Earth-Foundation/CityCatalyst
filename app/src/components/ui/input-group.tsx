import { Box, BoxProps, InputElementProps } from "@chakra-ui/react";
import { Group, InputElement } from "@chakra-ui/react";
import * as React from "react";

export interface InputGroupProps extends BoxProps {
  startElementProps?: InputElementProps;
  endElementProps?: InputElementProps;
  startElement?: React.ReactNode;
  endElement?: React.ReactNode;
  children: React.ReactElement<InputElementProps>;
  startOffset?: InputElementProps["paddingStart"];
  endOffset?: InputElementProps["paddingEnd"];
  addonBg?: BoxProps["backgroundColor"];
}

export const InputGroup = React.forwardRef<HTMLDivElement, InputGroupProps>(
  function InputGroup(props, ref) {
    const {
      startElement,
      startElementProps,
      endElement,
      endElementProps,
      children,
      startOffset = "6px",
      endOffset = "6px",
      addonBg,
      ...rest
    } = props;

    const child =
      React.Children.only<React.ReactElement<InputElementProps>>(children);

    return (
      <Group ref={ref} {...rest}>
        {startElement && (
          <InputElement
            bg={addonBg}
            pointerEvents="none"
            {...startElementProps}
          >
            {startElement}
          </InputElement>
        )}
        {React.cloneElement(child, {
          ...(startElement && {
            ps: `calc(var(--input-height) - ${startOffset})`,
          }),
          ...(endElement && {
            pe: `calc(var(--input-height) - ${endOffset})`,
          }),
          ...children.props,
        })}
        {endElement && (
          <InputElement
            height={`calc(100% - 2px)`}
            transform={`translateX(-1px)`}
            borderRightRadius={3}
            borderLeft={0}
            bg={addonBg}
            placement="end"
            {...endElementProps}
          >
            {endElement}
          </InputElement>
        )}
      </Group>
    );
  },
);

export const InputAddon = React.forwardRef<HTMLDivElement, InputElementProps>(
  function InputAddon(props, ref) {
    const { children, ...rest } = props;
    return (
      <Box backgroundColor="border.overlay" ref={ref} {...rest}>
        {children}
      </Box>
    );
  },
);
