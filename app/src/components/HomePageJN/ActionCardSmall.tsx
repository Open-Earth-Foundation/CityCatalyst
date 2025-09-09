import React from "react";
import { Card, Box, CardHeader, Text } from "@chakra-ui/react";

interface ActionCardSmallProps {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  color: string;
}

const ActionCardSmall: React.FC<ActionCardSmallProps> = ({
  onClick,
  icon,
  title,
  color,
}) => {
  return (
    <Card.Root
      onClick={onClick}
      shadow="none"
      backgroundColor="base.light"
      py={0}
      px={6}
      cursor="pointer"
      h="100px"
      w="full"
      borderRadius="16px"
      transition="box-shadow 0.2s ease-in-out"
      _hover={{ boxShadow: "md" }}
    >
      <Box display="flex" alignItems="center" h="full" gap="12px">
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          minH="48px"
          minW="48px"
          borderRadius="full"
        >
          {icon}
        </Box>
        <Box>
          <CardHeader p={0}>
            <Text
              fontFamily="heading"
              fontSize="title.lg"
              color={color}
              fontWeight="semibold"
            >
              {title}
            </Text>
          </CardHeader>
        </Box>
      </Box>
    </Card.Root>
  );
};

export default ActionCardSmall;
