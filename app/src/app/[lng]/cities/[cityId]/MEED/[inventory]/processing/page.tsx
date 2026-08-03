"use client";
import React from "react";
import { Box, Card } from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";
import { HeadlineSmall } from "@/components/package/Texts/Headline";
import { BodyLarge } from "@/components/package/Texts/Body";

export default function Page(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  const { lng } = React.use(props.params);
  const { t } = useTranslation(lng, "meed");

  return (
    <Box
      h="full"
      bg="background.backgroundLight"
      display="flex"
      flexDirection="column"
      alignItems="center"
      py="96px"
      px="24px"
      gap="24px"
    >
      <HeadlineSmall>{t("processing-title")}</HeadlineSmall>
      <Card.Root maxW="640px" w="full">
        <Card.Body>
          <BodyLarge color="content.secondary">
            {t("step-placeholder-description")}
          </BodyLarge>
        </Card.Body>
      </Card.Root>
    </Box>
  );
}
