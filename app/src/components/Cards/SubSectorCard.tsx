import { CheckIcon } from "@chakra-ui/icons";
import { Box, Card, Heading, Icon, Text } from "@chakra-ui/react";
import React, { FC } from "react";
import { MdOutlineCheckCircle } from "react-icons/md";
import { DataAlertIcon } from "../icons";

interface SubSectorCardProps {
  title: string;
  scopes: string;
  isCompleted: boolean;
}

const SubSectorCard: FC<SubSectorCardProps> = ({
  title,
  scopes,
  isCompleted,
}) => {
  return (
    <Card className="flex flex-row w-[333.1px] h-[100px] items-center px-4 gap-4 border border-[#E6E7FF] shadow-none">
      <Icon
        as={isCompleted ? MdOutlineCheckCircle : DataAlertIcon}
        boxSize={8}
        color={
          isCompleted ? "interactive.tertiary" : "sentiment.warningDefault"
        }
      />
      <Box className="flex flex-col gap-[8px]">
        <Heading
          fontSize="title.sm"
          fontWeight="medium"
          lineHeight="20"
          letterSpacing="wide"
          color="content.primary"
        >
          {title}
        </Heading>
        <Text
          fontWeight="regular"
          color="interactive.control"
          lineHeight="20"
          letterSpacing="wide"
        >
          Scope: {scopes}
        </Text>
      </Box>
    </Card>
  );
};

export default SubSectorCard;
