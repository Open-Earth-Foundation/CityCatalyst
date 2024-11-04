"use client";

import { useTranslation } from "@/i18n/client";
import { Box, Button, Heading, HStack, Text, VStack } from "@chakra-ui/react";
import Image from "next/image";
import NextLink from "next/link";
import { Trans } from "react-i18next/TransWithoutContext";
export default function Onboarding({
  params: { lng },
}: {
  params: { lng: string };
}) {
  const { t } = useTranslation(lng, "onboarding");

  const steps = [1, 2, 3, 4];

  return (
    <>
      <Box className="pt-[100px] w-[1050px] max-w-full mx-auto">
        <Box display="flex" gap="55px" alignItems="center">
          <Box w="full" h="full" display="flex" flexDir="column" gap="24px">
            <Text
              fontFamily="heading"
              fontWeight="600"
              lineHeight="16px"
              letterSpacing="1.5px"
              textTransform="uppercase"
              color="content.tertiary"
              fontSize="title.sm"
            >
              {t("create-inventory")}
            </Text>
            <Heading
              as="h1"
              color="content.alternative"
              fontSize="display.sm"
              lineHeight="44px"
              fontWeight="600"
              fontStyle="normal"
            >
              {t("create-ghg-inventory")}
            </Heading>
            <Text
              color="content.tertiary"
              fontSize="body.lg"
              lineHeight="24px"
              fontWeight="400"
              letterSpacing="wide"
            >
              {t("inventory-creation-description")}
            </Text>
          </Box>
          <Box>
            <Image
              src="/assets/onboarding-buildings-image.png"
              alt="buildings.png"
              height={420}
              width={900}
            />
          </Box>
        </Box>
      </Box>
      <Box
        bg="base.light"
        h="135px"
        w="full"
        pos="absolute"
        bottom="0"
        left="0"
      >
        {/* Place holder steppers */}
        <HStack p="4px">
          {steps.map((step) => (
            <Box
              h="8px"
              bg="background.neutral"
              w="full"
              borderRadius="8px"
            ></Box>
          ))}
          <Box h="full" w="full"></Box>
        </HStack>
      </Box>
    </>
  );
}
