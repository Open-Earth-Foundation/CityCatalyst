import { Box, Text } from "@chakra-ui/layout";
import Image from "next/image";
import { Button, Heading } from "@chakra-ui/react";
import { ArrowForwardIcon } from "@chakra-ui/icons";
import React from "react";
import { useTranslation } from "@/i18n/client";
import "dotenv/config";

const NotAvailable = ({ lng }: { lng: string }) => {
  const { t } = useTranslation(lng, "inventory-not-found");
  return (
    <Box className="flex w-full justify-center relative h-[100vh] z-10">
      <Image
        src="/assets/not-found-background.svg"
        layout="fill"
        objectFit="cover"
        sizes="100vw"
        className="relative"
        alt="not-found page background"
      />
      <Box
        display="flex"
        flexDir="column"
        alignItems="center"
        justifyContent="center"
        h="full"
        w="full"
        maxW="708px"
        zIndex="10"
      >
        <Heading
          fontSize="display.lg"
          mb="24px"
          textAlign="center"
          color="content.alternative"
          lineHeight="64px"
        >
          404
        </Heading>
        <Text
          mb="48px"
          textAlign="center"
          lineHeight="32px"
          color="content.tertiary"
          fontSize="body.extralarge"
          letterSpacing="wide"
        >
          {t("emission-mist")}
        </Text>
        <Button
          as="a"
          href={`${window.location.protocol}//${window.location.host}/${lng}/`}
          gap="8px"
          h="48px"
          px="24px"
          fontSize="body.md"
          rightIcon={<ArrowForwardIcon />}
        >
          {t("go-to-citycatalyst")}
        </Button>
      </Box>
    </Box>
  );
};

export default NotAvailable;
