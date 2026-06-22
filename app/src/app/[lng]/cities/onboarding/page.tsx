"use client";
import { use, useEffect, useRef } from "react";

import { useTranslation } from "@/i18n/client";
import { Box, Button, Heading, HStack, Text } from "@chakra-ui/react";
import Image from "next/image";
import NextLink from "next/link";
import { MdArrowForward, MdUpload } from "react-icons/md";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/services/api";

export default function Onboarding(props: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);
  const { t } = useTranslation(lng, "onboarding");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [acceptOrgInvite] = api.useAcceptOrganizationAdminInviteMutation();
  const acceptedOnce = useRef(false);

  useEffect(() => {
    const token = searchParams.get("token");
    const email = searchParams.get("email");
    const organizationId = searchParams.get("organizationId");

    if (!token || !email || !organizationId || acceptedOnce.current) return;
    acceptedOnce.current = true;

    const cleanedEmail = email.replace(/ /g, "+").replace(/%40/g, "@");
    acceptOrgInvite({ token, email: cleanedEmail, organizationId }).unwrap().catch(() => {
      // Silently ignore errors (e.g. already accepted) and let onboarding proceed
    });
  }, [searchParams, acceptOrgInvite]);

  const steps = [1, 2, 3, 4];
  const projectId = searchParams.get("project");
  const setupHref = projectId ? `setup?project=${projectId}` : "setup";
  const uploadSetupHref = projectId
    ? `setup?project=${projectId}&mode=upload`
    : "setup?mode=upload";

  return (
    <>
      <Box w={"1090px"} maxW="full" mx="auto">
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
              data-testid="start-page-title"
            >
              {t("welcome-top")}
            </Text>
            <Heading
              as="h1"
              color="content.alternative"
              fontSize="display.sm"
              lineHeight="44px"
              fontWeight="600"
              fontStyle="normal"
              data-testid="start-page-heading"
            >
              {t("welcome-title")}
            </Heading>
            <Text
              color="content.tertiary"
              fontSize="body.lg"
              lineHeight="24px"
              fontWeight="400"
              letterSpacing="wide"
              data-testid="start-page-description"
            >
              {t("welcome-description")}
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
      <Box bg="base.light" h="145px" w="full" pos="fixed" bottom="0" left="0" data-onboarding-bottom-bar>
        {/* Place holder steppers */}
        <HStack p="4px">
          {steps.map((step) => (
            <Box
              key={step}
              h="8px"
              bg="background.neutral"
              w="full"
              borderRadius="8px"
            ></Box>
          ))}
        </HStack>
        <Box
          h="full"
          w="full"
          display="flex"
          justifyContent="end"
          py="32px"
          px="175px"
          gap="16px"
        >
          <Button
            w="auto"
            gap="8px"
            py="16px"
            px="24px"
            h="64px"
            variant="outline"
            onClick={() => router.push(uploadSetupHref)}
            data-testid="upload-inventory-button"
          >
            <MdUpload height="24px" width="24px" />
            <Text fontFamily="button.md" fontWeight="600" letterSpacing="wider">
              {t("upload-existing-inventory")}
            </Text>
          </Button>
          <Button
            w="auto"
            gap="8px"
            py="16px"
            px="24px"
            h="64px"
            onClick={() => router.push(setupHref)}
            data-testid="start-inventory-button"
          >
            <Text fontFamily="button.md" fontWeight="600" letterSpacing="wider">
              {t("welcome-CTA")}
            </Text>
            <MdArrowForward height="24px" width="24px" />
          </Button>
        </Box>
      </Box>
    </>
  );
}
