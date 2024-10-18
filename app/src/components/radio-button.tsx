import { Box, Flex, Icon, Text, useRadio } from "@chakra-ui/react";
import { MdCheck } from "react-icons/md";

export function RadioButton(props: any) {
  const { getInputProps, getRadioProps, state } = useRadio(props);

  const input = getInputProps();
  const checkbox = getRadioProps();

  return (
    <Box as="label" className="!mb-0">
      <input {...input} />
      <Box
        {...checkbox}
        cursor="pointer"
        borderRadius="full"
        bg="base.light"
        borderWidth={2}
        textTransform="uppercase"
        fontWeight="bold"
        letterSpacing={0.25}
        color="content.tertiary"
        _checked={{
          bg: "background.neutral",
          color: "interactive.secondary",
          borderColor: "background.neutral",
        }}
        _focus={{
          borderColor: "interactive.secondary",
        }}
        px={5}
        py={4}
        height={"40px"}
        minHeight={12}
      >
        <Flex
          direction="row"
          alignItems="center"
          className="h-full"
          verticalAlign="center"
        >
          {state.isChecked && <Icon as={MdCheck} boxSize={5} mr={2} />}
          <Text fontSize="13px">{props.children}</Text>
        </Flex>
      </Box>
    </Box>
  );
}
