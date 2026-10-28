"use client";

import { Box, Icon, Text } from "@chakra-ui/react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { MdArrowForward } from "react-icons/md";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import { getCityHomePath } from "@/util/routes";

const CITY_PATH_REGEX = /\/cities\/([0-9a-f]{8}-[0-9a-f-]{27})(?:\/|$)/i;

interface NotFoundPageProps {
  lng: string;
}

export function NotFoundPage({ lng }: NotFoundPageProps) {
  const router = useRouter();
  const { t } = useTranslation(lng, "not-found");
  const pathname = usePathname();

  // Prefer the city in the broken URL; otherwise fall back to the user's
  // default city, and finally to the cities list.
  const cityIdFromPath = pathname?.match(CITY_PATH_REGEX)?.[1];
  const { data: userInfo } = api.useGetUserInfoQuery(undefined, {
    skip: !!cityIdFromPath,
  });
  const cityId = cityIdFromPath ?? userInfo?.defaultCityId;
  const cityPath = cityId ? getCityHomePath(lng, cityId) : `/${lng}/cities`;

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
        gap={4}
        alignItems="center"
        justifyContent="center"
        textAlign="center"
        h="full"
        w="full"
        px={6}
        zIndex="10"
      >
        <Text
          as="h1"
          fontSize="headline.lg"
          fontWeight="bold"
          fontFamily="heading"
          color="content.alternative"
        >
          {t("page-not-found")}
        </Text>
        <Text
          maxW="lg"
          fontFamily="body"
          fontSize="body.lg"
          color="content.alternative"
          mb={4}
        >
          {t("page-not-found-description")}
        </Text>
        <Button
          onClick={() => router.push(cityPath)}
          gap={2}
          h={12}
          px={6}
          fontSize="body.md"
          data-testid="not-found-back-button"
        >
          {t("back-to-city")}
          <Icon as={MdArrowForward} />
        </Button>
      </Box>
    </Box>
  );
}
