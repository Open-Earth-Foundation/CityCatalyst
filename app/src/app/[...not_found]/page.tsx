"use client";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";

import { Text, Box, Icon } from "@chakra-ui/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { use } from "react";
import { MdArrowForward } from "react-icons/md";

const NotFound = (props: { params: Promise<{ lng: string }> }) => {
  const { lng } = use(props.params);

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
        style={{ position: "relative" }}
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
        <Text
          mb="48px"
          w="0px"
          width="400px"
          textAlign="center"
          lineHeight="32px"
          letterSpacing="wide"
        >
          {t("not-found-description")}
        </Text>
        <Button
          onClick={() => router.push("/")}
          gap="8px"
          h="48px"
          px="24px"
          fontSize="body.md"
        >
          {t("goto-dashboard")}
          <Icon as={MdArrowForward} />
        </Button>
      </Box>
    </Box>
  );
};

export default NotFound;
