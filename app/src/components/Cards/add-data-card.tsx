import {
  Box,
  Button,
  Card,
  Divider,
  Heading,
  Icon,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import React from "react";
import { IconType } from "react-icons";
import { BsPlus } from "react-icons/bs";

interface AddDataCardProps {
  icon: IconType;
  title: string;
  description: string;
  scopeText: string;
  number: number;
  buttonText: string;
  testId?: string;
  inventory: string;
}

function AddDataCard({
  icon,
  description,
  testId,
  scopeText,
  number,
  buttonText,
  title,
  inventory,
}: AddDataCardProps) {
  const router = useRouter();
  return (
    <Card
      className="grow flex flex-col"
      boxShadow="none"
      data-testid={testId}
      p={6}
      borderColor="border.overlay"
      borderWidth={1}
      height="100%"
    >
      <VStack justify="space-between" className="gap-6" height="100%">
        <Box className="flex flex-col gap-6">
          <VStack align="left">
            <Icon as={icon} height="32px" w="32px" color="brand.secondary" />
            <Heading fontSize="title.lg">{title}</Heading>
          </VStack>
          <Divider borderColor="border.overlay" />
          <Text color="content.tertiary">{description}</Text>
          <Text
            size="label.md"
            fontWeight="medium"
            color="content.secondary"
            fontFamily="heading"
            fontSize="12px"
            lineHeight="16px"
            letterSpacing="wide"
          >
            {scopeText}
          </Text>
        </Box>
        <Button
          data-testid="sector-card-button"
          width="100%"
          onClick={() => router.push(`/${inventory}/data/${number}`)}
          leftIcon={<BsPlus size={32} />}
          variant="ghost"
          h="48px"
          bg="interactive.secondary"
          color="base.light"
          mt="auto"
        >
          {buttonText}
        </Button>
      </VStack>
    </Card>
  );
}

export default AddDataCard;
