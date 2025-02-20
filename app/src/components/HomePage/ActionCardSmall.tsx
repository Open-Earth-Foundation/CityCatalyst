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
      <Box className="flex items-center h-full">
        <Box className="flex items-center justify-center min-h-[48px] min-w-[48px] rounded-full bg-[#2351DC]">
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
