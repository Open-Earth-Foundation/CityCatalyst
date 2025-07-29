import React from "react";
import { Card, Box, CardHeader, Text } from "@chakra-ui/react";

interface ActionCardSmallProps {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
}

const ActionCardSmall: React.FC<ActionCardSmallProps> = ({
  onClick,
  icon,
  title,
}) => {
  return (
    <Card.Root
      onClick={onClick}
      shadow="2dp"
      backgroundColor="base.light"
      py={0}
      px={6}
      cursor="pointer"
      h="100px"
      transition="box-shadow 0.2s ease-in-out"
      _hover={{ boxShadow: "xl" }}
    >
      <Box display="flex" alignItems="center" h="full">
        <Box
          bg="content.link"
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
          <CardHeader pt={0}>
            <Text
              fontFamily="heading"
              fontSize="title.lg"
              color="interactive.secondary"
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
