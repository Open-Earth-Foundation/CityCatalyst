import {
  Box,
  Button,
  Card,
  Heading,
  Icon,
  Separator,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useRouter, usePathname } from "next/navigation";
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
  const pathname = usePathname();
  return (
    <Card.Root
      flexGrow={1}
      display="flex"
      flexDirection="column"
      boxShadow="none"
      data-testid={testId}
      p={6}
      borderColor="border.overlay"
      borderWidth={1}
      height="100%"
    >
      <VStack justify="space-between" gap="24px" height="100%">
        <Box display="flex" flexDirection="column" gap={6}>
          <VStack align="left" display="flex" gap="24px">
            <Icon
              as={icon}
              height="32px"
              w="32px"
              color="content.alternative"
            />
            <Heading fontSize="title.lg">{title}</Heading>
          </VStack>
          <Separator borderColor="border.overlay" />
          <Text color="content.tertiary">{description}</Text>
          <Text
            fontWeight="medium"
            color="content.secondary"
            fontFamily="heading"
            fontSize="label.md"
            lineHeight="16px"
            letterSpacing="wide"
          >
            {scopeText}
          </Text>
        </Box>
        <Button
          data-testid="sector-card-button"
          width="100%"
          onClick={() => router.push(`${pathname}/${number}`)}
          variant="ghost"
          h="48px"
          bg="interactive.secondary"
          color="base.light"
          mt="auto"
        >
          <Icon as={BsPlus} h={8} w={8} />
          {buttonText}
        </Button>
      </VStack>
    </Card.Root>
  );
}

export default AddDataCard;
