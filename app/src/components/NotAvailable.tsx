import { Box, Text } from "@chakra-ui/react";
import Image from "next/image";
import { Button, Heading } from "@chakra-ui/react";
import React from "react";
import { useTranslation } from "@/i18n/client";
import { MdArrowForward } from "react-icons/md";
import NextLink from "next/link";

const NotAvailable = ({ lng }: { lng: string }) => {
  const { t } = useTranslation(lng, "inventory-not-found");
  return (
    <Box className="flex w-full justify-center relative h-screen z-10">
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
        <NextLink
          href={`${window.location.protocol}//${window.location.host}/${lng}/`}
        >
          <Button gap="8px" h="48px" px="24px" fontSize="body.md">
            {t("go-to-citycatalyst")}
            <MdArrowForward />
          </Button>
        </NextLink>
      </Box>
    </Box>
  );
};

export default NotAvailable;
