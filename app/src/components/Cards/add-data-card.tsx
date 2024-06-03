import { Button, Card, Divider, Heading, Icon, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import React, { FC } from "react";
import { IconType } from "react-icons";
import { BsPlus } from "react-icons/bs";

interface AddDataCardProps {
  icon: IconType;
  title: string;
  description: string;
  scopeText: string;
  step: number;
  buttonText: string;
  inventory: string;
}

function AddDataCard({
  icon,
  description,
  scopeText,
  step,
  buttonText,
  title,
  inventory,
}: AddDataCardProps) {
  const router = useRouter();
  return (
    <Card
      className="space-y-6 grow w-1/3"
      boxShadow="none"
      p={6}
      borderColor="border.overlay"
      borderWidth={1}
    >
      <Icon as={icon} height="32px" w="32px" color="brand.secondary" />
      <Heading fontSize="title.lg">{title}</Heading>
      <Divider borderColor="border.overlay" />
      <Text color="content.tertiary">{description}</Text>
      <div className="grow" />
      <Text
        size="label.md"
        fontWeight="medium"
        color="content.secondary"
        fontFamily="heading"
        lineHeight="16px"
        letterSpacing="wide"
      >
        {scopeText}
      </Text>
      <Button
        onClick={() => router.push(`/${inventory}/data/${step}`)}
        leftIcon={<BsPlus size={32} />}
        variant="ghost"
        h="48px"
        bg="interactive.secondary"
        color="base.light"
      >
        {buttonText}
      </Button>
    </Card>
  );
}

export default AddDataCard;
