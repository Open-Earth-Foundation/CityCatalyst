"use client";

import { Box, Icon, Text } from "@chakra-ui/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { MdArrowForward } from "react-icons/md";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";

interface NotFoundPageProps {
  lng: string;
}

export function NotFoundPage({ lng }: NotFoundPageProps) {
  const router = useRouter();
  const { t } = useTranslation(lng, "not-found");

  return (
    <Box
      display="flex"
      justifyContent="flex-start"
      position="relative"
      h="100vh"
      zIndex={20}
    >
      <Image
        src="/assets/not-found-background.svg"
        layout="fill"
        objectFit="cover"
        sizes="100vw"
        alt="not-found page background"
      />
      <Box
        display="flex"
        flexDir="column"
        gap=""
        alignItems="center"
        justifyContent="center"
        h="full"
        w="full"
        zIndex="10"
      >
        <Text
          fontSize="display.xl"
          fontWeight="bold"
          fontFamily="heading"
          color="content.alternative"
        >
          404
        </Text>
        <Button
          onClick={() => router.push("/")}
          gap="8px"
          h="48px"
          px="24px"
          fontSize="body.md"
        >
          {t("back-to-tools")}
          <Icon as={MdArrowForward} />
        </Button>
      </Box>
    </Box>
  );
}
