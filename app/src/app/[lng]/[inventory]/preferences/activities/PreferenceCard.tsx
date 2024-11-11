import type { TFunction } from "i18next";
import { Button, Text, VStack } from "@chakra-ui/react";
import Image from "next/image";

export function PreferenceCard({
  onClick,
  src,
  title,
  t,
}: {
  onClick: () => void;
  src: string;
  t: TFunction;
  title: string;
}) {
  return (
    <Button
      onClick={onClick}
      variant="outline"
      width={"300px"}
      height="auto"
      borderRadius={"md"}
      borderColor={"border.neutral"}
      p={4}
      display="flex"
      flexDirection="column"
      alignItems="start"
    >
      <VStack spacing={2} align={"start"}>
        <Image
          src={src}
          alt={"imageAlt"}
          width={32}
          height={32}
          objectFit="cover"
        />
        <Text
          fontSize="label.lg"
          fontWeight="medium"
          color="gray.700"
          textTransform="none"
          whiteSpace="normal"
          textAlign="left"
        >
          {t(title)}
        </Text>
      </VStack>
    </Button>
  );
}
