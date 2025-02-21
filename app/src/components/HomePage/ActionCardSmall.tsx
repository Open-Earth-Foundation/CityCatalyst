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
      className="h-[100px] hover:shadow-xl cursor-pointer"
      py={0}
      px={6}
    >
      <Card.Body
        display="flex"
        flexDir="row"
        alignItems="center"
        h="full"
        gap="4"
        px={0}
      >
        <Box className="flex items-center justify-center h-[48px] w-[48px] rounded-full bg-[#2351DC]">
          {icon}
        </Box>
        <Box>
          <Text
            fontFamily="heading"
            fontSize="title.lg"
            color="interactive.secondary"
            fontWeight="semibold"
            truncate
          >
            {title}
          </Text>
        </Box>
      </Card.Body>
    </Card.Root>
  );
};

export default ActionCardSmall;
