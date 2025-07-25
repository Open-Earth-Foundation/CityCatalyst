import { Box, Button, Icon } from "@chakra-ui/react";
import type { JSX } from "react";
import { IconBaseProps } from "react-icons";

const ButtonGroupToggle = ({
  options,
  activeOption,
}: {
  options: {
    label: string;
    value: string;
    onClick: () => void;
    icon: (val: IconBaseProps) => JSX.Element;
  }[];
  activeOption: string;
}) => {
  return (
    <Box
      display="flex"
      alignItems="center"
      borderWidth="1px"
      borderColor="border.overlay"
      borderRadius="4px"
    >
      {options.map((option) => (
        <Button
          key={option.label}
          variant="outline"
          onClick={option.onClick}
          display="flex"
          gap={2}
          py={3}
          px={4}
          fontSize="14px"
          rounded="4px"
          backgroundColor={
            option.value === activeOption ? "background.neutral" : "white"
          }
          borderWidth={option.value != activeOption ? "0px" : "1px"}
          color={
            option.value === activeOption
              ? "interactive.secondary"
              : "content.tertiary"
          }
        >
          <Icon
            fill={
              option.value === activeOption
                ? "interactive.secondary"
                : "interactive.control"
            }
            as={option.icon}
          />
          {option.label}
        </Button>
      ))}
    </Box>
  );
};

export default ButtonGroupToggle;
