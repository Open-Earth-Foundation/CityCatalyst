import { Box, Link, Text, Heading } from "@chakra-ui/react";
import Image from "next/image";
import { useTranslation } from "@/i18n/client";
import { useRouter } from "next/navigation";
import { MdArrowForward } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { BodyXLarge } from "./Texts/Body";
import { DisplayLarge } from "./Texts/Display";

const MissingCityDashboard = ({
  lng,
  cityId,
  error,
  isPublic = false,
}: {
  lng: string;
  cityId?: string;
  error?: any;
  isPublic?: boolean;
}) => {
  const { t } = useTranslation(lng, "dashboard");
  const router = useRouter();

  // Determine if it's a 401 (access denied) or 404 (city not found)
  const is401Error = error?.status === 401;
  const isAccessDenied = is401Error;

  const title = isAccessDenied ? t("access-denied") : t("city-not-found");

  const description = isAccessDenied
    ? t("access-denied-description")
    : t("city-not-found-description");

  const handleGoBack = () => {
    router.push(isPublic ? `/${lng}/public` : `/${lng}`);
  };

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
        <DisplayLarge mb="24px" textAlign="center" color="content.alternative">
          {title}
        </DisplayLarge>
        <BodyXLarge mb="48px" textAlign="center" color="content.tertiary">
          {description}{" "}
          {isAccessDenied && (
            <>
              {t("possible-mistake")}{" "}
              <Link
                textDecoration="underline"
                whiteSpace="nowrap"
                fontWeight="semibold"
                color="content.link"
                href={"mailto:" + process.env.NEXT_PUBLIC_SUPPORT_EMAILS}
              >
                {t("please-contact-us")}
              </Link>
            </>
          )}
        </BodyXLarge>
        <Button
          onClick={handleGoBack}
          gap="8px"
          h="48px"
          px="24px"
          fontSize="body.md"
        >
          <MdArrowForward /> {t("go-back")}
        </Button>
      </Box>
    </Box>
  );
};

export default MissingCityDashboard;
