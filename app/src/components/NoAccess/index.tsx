import { Box, Heading, Text, Grid, GridItem } from "@chakra-ui/react"; // Import Grid and GridItem
import { useTranslation } from "@/i18n/client";
import { Trans } from "react-i18next";
import React from "react";
import Image from "next/image";
import { NavigationBar } from "@/components/navigation-bar";

const NoAccessPage = ({ lng, email }: { lng: string; email: string }) => {
  const { t } = useTranslation(lng, "no-access");

  return (
    <Box
      display="flex"
      flexDirection="column"
      minHeight="100vh"
      bg="background.backgroundLight"
    >
      <NavigationBar showMenu lng={lng} isPublic={true} />

      <Grid
        flex="1"
        templateColumns={{ base: "1fr", md: "1fr 1fr" }}
        gap={{ base: 6, md: 8 }}
        alignItems="center"
        p={{ base: 4, md: 8 }}
        width="100%"
      >
        <GridItem display="flex" justifyContent="center">
          <Box
            maxW={{ base: "100%", md: "500px" }}
            display="flex"
            flexDirection="column"
            justifyContent="center"
          >
            <Heading
              fontSize={{ base: "display.xs", md: "display.sm" }}
              fontWeight="600"
              color="content.alternative"
              mb={4}
            >
              {t("no-access-heading")}
            </Heading>
            <Text
              fontSize={{ base: "body.sm", md: "body.lg" }}
              fontWeight="600"
              color="textSecondary"
            >
              <Trans
                i18nKey="no-access-description"
                t={t}
                values={{
                  email: email,
                }}
                components={{
                  bold: <strong />,
                }}
              />
            </Text>
          </Box>
        </GridItem>
        <GridItem position="relative" width="100%" aspectRatio={4 / 3}>
          <Image
            src="/assets/no-access.png"
            alt="no access image"
            layout="fill"
            objectFit="contain"
          />
        </GridItem>
      </Grid>
    </Box>
  );
};

export default NoAccessPage;
