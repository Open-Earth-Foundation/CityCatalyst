import { Box, Card, Heading, Icon, Text } from "@chakra-ui/react";
import React, { FC } from "react";
import { MdOutlineCheckCircle } from "react-icons/md";
import { DataAlertIcon } from "../icons";
import type { TFunction } from "i18next";
import {
  ProgressCircleRing,
  ProgressCircleRoot,
} from "@/components/ui/progress-circle";

interface SubSectorCardProps {
  title: string;
  scopes: string;
  isCompleted: boolean;
  percentageCompletion: number;
  t: TFunction;
}

const SubSectorCard: FC<SubSectorCardProps> = ({
  title,
  scopes,
  isCompleted,
  percentageCompletion,
  t,
}) => {
  return (
    <Card.Root
      display="flex"
      flexDirection="row"
      h="120px"
      alignItems="center"
      px={4}
      gap={2}
      borderWidth={1}
      borderColor="#E6E7FF"
      shadow="none"
    >
      {percentageCompletion > 0 && percentageCompletion < 100 ? (
        <ProgressCircleRoot
          size="xs"
          value={percentageCompletion}
          color="background.neutral"
          mr={4}
        >
          <ProgressCircleRing
            color="interactive.secondary"
            css={{ "--thickness": "4px" }}
          />
        </ProgressCircleRoot>
      ) : (
        <Icon
          as={isCompleted ? MdOutlineCheckCircle : DataAlertIcon}
          boxSize={10}
          color={
            isCompleted ? "interactive.tertiary" : "sentiment.warningDefault"
          }
        />
      )}
      <Box display="flex" flexDirection="column" gap="8px">
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
          {t("scope")}: {scopes}
        </Text>
      </Box>
    </Card.Root>
  );
};

export default SubSectorCard;
