"use client";
import { use } from "react";

import { useTranslation } from "@/i18n/client";
import { Box, Button, Heading, HStack, Text } from "@chakra-ui/react";
import Image from "next/image";
import { MdArrowForward } from "react-icons/md";
import { useRouter } from "next/navigation";
import ProgressSteps from "@/components/steps/progress-steps";

export default function Onboarding(props: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);
  const { t } = useTranslation(lng, "onboarding");
  const router = useRouter();

  const steps = [
    { title: t("ghgi-onboarding-inventory-step") },
    { title: t("ghgi-onboarding-population-step") },
    { title: t("ghgi-onboarding-confirm-step") },
  ];

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
              {t("create-inventory")}
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
              {t("create-ghg-inventory")}
            </Heading>
            <Text
              color="content.tertiary"
              fontSize="body.lg"
              lineHeight="24px"
              fontWeight="400"
              letterSpacing="wide"
              data-testid="start-page-description"
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
      <Box bg="base.light" h="145px" w="full" pos="fixed" bottom="0" left="0">
        {/* Progress Steps */}
        <Box p="4px">
          <ProgressSteps steps={steps} currentStep={-1} />
        </Box>
        <Box
          h="full"
          w="full"
          display="flex"
          justifyContent="end"
          py="32px"
          px="175px"
        >
          <Button
            w="auto"
            gap="8px"
            py="16px"
            px="24px"
            h="64px"
            onClick={() => router.push("setup")}
          >
            <Text fontFamily="button.md" fontWeight="600" letterSpacing="wider">
              {t("start-inventory")}
            </Text>
            <MdArrowForward height="24px" width="24px" />
          </Button>
        </Box>
      </Box>
    </>
  );
}
