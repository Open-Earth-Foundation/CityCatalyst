"use client";

import { Box, Button, Card, Icon, VStack } from "@chakra-ui/react";
import React from "react";
import { useParams } from "next/navigation";
import { MdCloudUpload } from "react-icons/md";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import { getParamValueRequired } from "@/util/helpers";
import { HeadlineMedium } from "@/components/package/Texts/Headline";
import { BodyLarge } from "@/components/package/Texts/Body";
import { UseSuccessToast, UseErrorToast } from "@/hooks/Toasts";

function Page() {
  const params = useParams();
  const lng = getParamValueRequired(params.lng);
  const inventory = getParamValueRequired(params.inventory);

  const { t } = useTranslation(lng, "cdp");

  const { showSuccessToast } = UseSuccessToast({
    title: t("success-title"),
    description: t("success-description"),
  });

  const { showErrorToast } = UseErrorToast({
    title: t("error-title"),
    description: t("error-description"),
  });

  const [connectToCDP, { isLoading }] = api.useConnectToCDPMutation();

  const handleConnectToCDP = async () => {
    try {
      const res: { data?: any; error?: any } = await connectToCDP({
        inventoryId: inventory,
      });

      if (res.error) {
        const message =
          res.error?.data?.error?.message ||
          res.error?.message ||
          t("error-description");
        showErrorToast({ title: t("error-title"), description: message });
      } else {
        showSuccessToast();
      }
    } catch (error: any) {
      showErrorToast({
        title: t("error-title"),
        description: error?.message || t("error-description"),
      });
    }
  };

  return (
    <Box
      minH="calc(100vh - 200px)"
      w="full"
      display="flex"
      justifyContent="center"
      alignItems="center"
      bg="background.default"
      py="64px"
    >
      <Card.Root
        maxW="500px"
        w="full"
        mx="24px"
        borderRadius="8px"
        borderWidth="1px"
        borderColor="border.overlay"
        shadow="lg"
        overflow="hidden"
      >
        <Box
          bg="interactive.secondary"
          py="32px"
          display="flex"
          justifyContent="center"
          alignItems="center"
        >
          <Box
            display="flex"
            alignItems="center"
            justifyContent="center"
            h="80px"
            w="80px"
            borderRadius="full"
            bg="base.light"
          >
            <Icon
              as={MdCloudUpload}
              boxSize="40px"
              color="interactive.secondary"
            />
          </Box>
        </Box>

        <VStack gap="16px" p="32px" align="center">
          <HeadlineMedium textAlign="center">{t("page-title")}</HeadlineMedium>

          <BodyLarge textAlign="center" color="content.secondary">
            {t("page-description")}
          </BodyLarge>

          <Button
            onClick={handleConnectToCDP}
            loading={isLoading}
            loadingText={t("submitting")}
            w="full"
            h="48px"
            mt="16px"
            colorPalette="blue"
            size="md"
          >
            {t("submit-button")}
          </Button>
        </VStack>
      </Card.Root>
    </Box>
  );
}

export default Page;
