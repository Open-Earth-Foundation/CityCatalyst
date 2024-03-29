"use client";
import { api } from "@/services/api";
import { ArrowForwardIcon } from "@chakra-ui/icons";
import { Box, Text } from "@chakra-ui/layout";
import { Button, IconButton } from "@chakra-ui/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import React from "react";

const NotFound = () => {
  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();
  const router = useRouter();

  return (
    <Box className="flex w-full justify-start relative h-[100vh] z-20">
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
          Seems like we&apos;ve wandered into the emission mist. Please go back
          to the dashboard
        </Text>
        <Button
          onClick={() => router.push(`/${userInfo?.defaultInventoryId}`)}
          gap="8px"
          h="48px"
          px="24px"
          isLoading={isUserInfoLoading}
        >
          <Text fontSize="body.md">go to dashboard</Text>
          <ArrowForwardIcon />
        </Button>
      </Box>
    </Box>
  );
};

export default NotFound;
