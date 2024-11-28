import { Box, Link, Text } from "@chakra-ui/layout";
import Image from "next/image";
import { Button, CircularProgress, Heading } from "@chakra-ui/react";
import { ArrowForwardIcon } from "@chakra-ui/icons";
import React, { useEffect } from "react";
import { useTranslation } from "@/i18n/client";
import { useRouter } from "next/navigation";
import { api } from "@/services/api";

const MissingInventory = ({ lng }: { lng: string }) => {
  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();
  const { t } = useTranslation(lng, "inventory-not-found");
  const router = useRouter();
  useEffect(() => {
    if (!isUserInfoLoading && !userInfo?.defaultInventoryId) {
      router.push("onboarding");
    }
  }, [isUserInfoLoading, userInfo, router]);

  if (!isUserInfoLoading && userInfo?.defaultInventoryId) {
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
            {t("not_part_of_team")}
          </Heading>
          <Text
            mb="48px"
            textAlign="center"
            lineHeight="32px"
            color="content.tertiary"
            fontSize="body.extralarge"
            letterSpacing="wide"
          >
            {t("not_part_of_team_description")}. {t("possible_mistake")}{" "}
            <Link
              className="underline text-nowrap"
              fontWeight="semibold"
              color="content.link"
              href="mailto:greta@openearth.com, ux@openearth.com"
            >
              {t("please_contact_us")}
            </Link>{" "}
          </Text>
          <Button
            onClick={() =>
              router.push(
                userInfo?.defaultInventoryId
                  ? `/${userInfo?.defaultInventoryId}`
                  : "onboarding",
              )
            }
            gap="8px"
            h="48px"
            px="24px"
            fontSize="body.md"
            isLoading={isUserInfoLoading}
            rightIcon={<ArrowForwardIcon />}
          >
            {t("goto-dashboard")}
          </Button>
        </Box>
      </Box>
    );
  }
  return (
    <Box
      alignItems="center"
      justifyContent="center"
      className="flex w-full relative h-[100vh] z-10"
    >
      <CircularProgress isIndeterminate />
    </Box>
  );
};
export default MissingInventory;
