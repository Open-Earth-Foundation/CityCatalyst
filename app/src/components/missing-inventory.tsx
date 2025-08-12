import { Box, Link, Text, Heading } from "@chakra-ui/react";
import Image from "next/image";
import { useEffect } from "react";
import { useTranslation } from "@/i18n/client";
import { useRouter } from "next/navigation";
import { api } from "@/services/api";
import { MdArrowForward } from "react-icons/md";
import { Button } from "@/components/ui/button";
import {
  ProgressCircleRing,
  ProgressCircleRoot,
} from "@/components/ui/progress-circle";

const MissingInventory = ({
  lng,
  cityId,
}: {
  lng: string;
  cityId?: string;
}) => {
  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();
  const { t } = useTranslation(lng, "inventory-not-found");
  const router = useRouter();

  console.log("🔍 MissingInventory render:", {
    lng,
    cityId,
    isUserInfoLoading,
    userInfo: userInfo ? "exists" : "null",
    defaultInventoryId: userInfo?.defaultInventoryId,
    currentUrl: typeof window !== "undefined" ? window.location.href : "server",
  });

  useEffect(() => {
    console.log("🚀 MissingInventory useEffect triggered:", {
      isUserInfoLoading,
      hasDefaultInventory: !!userInfo?.defaultInventoryId,
      cityId,
      willRedirect:
        !isUserInfoLoading && !userInfo?.defaultInventoryId && !!cityId,
    });

    if (isUserInfoLoading) {
      console.log("⏳ MissingInventory: Still loading user info, waiting...");
      return;
    }

    if (userInfo?.defaultInventoryId) {
      console.log(
        "✅ MissingInventory: User has default inventory, redirecting to:",
        userInfo.defaultInventoryId,
      );
      // TODO send to JNHome [ON-4452]
      router.push(`/${lng}/${userInfo.defaultInventoryId}`);
      return;
    }

    // Only redirect if we have a cityId (meaning we're in a city context)
    // If no cityId, we're on the root language page and should redirect to cities onboarding
    if (cityId) {
      console.log(
        "🔄 MissingInventory: Redirecting to GHGI onboarding for city:",
        cityId,
      );
      router.push(`/${lng}/cities/${cityId}/GHGI/onboarding`);
    } else {
      console.log(
        "🏠 MissingInventory: No cityId - redirecting to cities onboarding",
      );
      router.push(`/${lng}/cities/onboarding`);
    }
  }, [isUserInfoLoading, userInfo, router, lng, cityId]);

  if (!isUserInfoLoading && userInfo?.defaultInventoryId) {
    return (
      <Box
        display="flex"
        w="full"
        justifyContent="center"
        position="relative"
        h="100vh"
        zIndex={10}
      >
        <Image
          src="/assets/not-found-background.svg"
          fill
          style={{ objectFit: "cover" }}
          sizes="100vw"
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
              textDecoration="underline"
              whiteSpace="nowrap"
              fontWeight="semibold"
              color="content.link"
              href={"mailto:" + process.env.NEXT_PUBLIC_SUPPORT_EMAILS}
            >
              {t("please_contact_us")}
            </Link>{" "}
          </Text>
          <Button
            onClick={() => {
              if (userInfo?.defaultInventoryId) {
                router.push(`/${userInfo?.defaultInventoryId}`);
              } else if (cityId) {
                router.push(`/${lng}/cities/${cityId}/GHGI/onboarding`);
              } else {
                router.push(`/${lng}/cities/onboarding`);
              }
            }}
            gap="8px"
            h="48px"
            px="24px"
            fontSize="body.md"
            loading={isUserInfoLoading}
          >
            <MdArrowForward /> {t("goto-dashboard")}
          </Button>
        </Box>
      </Box>
    );
  }
  return (
    <Box display="flex" w="full" position="relative" h="100vh" zIndex={10}>
      <ProgressCircleRoot value={null} size="sm">
        <ProgressCircleRing cap="round" />
      </ProgressCircleRoot>
    </Box>
  );
};
export default MissingInventory;
