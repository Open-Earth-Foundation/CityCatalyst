import { Box, Button, Heading, Text, VStack } from "@chakra-ui/react";
import Image from "next/image";
import { Link } from "@chakra-ui/react";
import React from "react";
import FooterLink from "../Navigation/FooterLink";
import { useTranslation } from "@/i18n/client";
import { getCurrentVersion } from "@/util/helpers";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";
import { TitleSmall } from "../Texts/Title";

const Footer = ({ lng }: { lng: string }) => {
  const currentVersion = getCurrentVersion();
  const { t } = useTranslation(lng, "footer");
  const { organization } = useOrganizationContext();
  const logoUrl = organization?.logoUrl;
  return (
    <Box as="footer" w="full" h="320px" bg="#00001f" pt={"48px"}>
      <Box w="full" px={"64px"}>
        <Box display="flex" justifyContent="space-between" w="full" pb={10}>
          <Box>
            {logoUrl ? (
              <img src={logoUrl} width={200} alt="Org logo" />
            ) : (
              <Image
                src="/assets/city_catalyst_logo.svg"
                alt="city-catalyst-logo"
                width={121}
                height={24}
              />
            )}
          </Box>
          <Box
            color="white"
            fontSize="14px"
            w="60%"
            display="grid"
            gridTemplateColumns="repeat(3, 1fr)"
            gap={6}
            fontFamily="poppins"
          >
            <VStack align="flex-start">
              <TitleSmall color="background.overlay" textTransform="uppercase">
                {t("about")}
              </TitleSmall>
              <FooterLink
                url="https://citycatalyst.openearth.org/"
                title={t("about-citycatalyst")}
              />
              <FooterLink
                url="https://wiki.climatedata.network/"
                title={t("cad")}
              />

              <FooterLink
                url="https://citycatalyst.openearth.org/privacy"
                title={t("our-privacy-policy")}
              />
            </VStack>
            <VStack align="flex-start">
              <TitleSmall color="background.overlay" textTransform="uppercase">
                {t("developers")}
              </TitleSmall>

              <FooterLink
                url="https://github.com/Open-Earth-Foundation/CityCatalyst"
                title={t("goto-gh")}
              />
              <FooterLink
                url="https://github.com/Open-Earth-Foundation/OpenClimate/blob/develop/CONTRIBUTING.md"
                title={t("contribution-guide")}
              />

              <FooterLink
                url="https://github.com/Open-Earth-Foundation/CityCatalyst/wiki"
                title={t("read-the-docs")}
              />
            </VStack>

            <VStack align="flex-start">
              <TitleSmall color="background.overlay" textTransform="uppercase">
                {t("resources")}
              </TitleSmall>
              <FooterLink url="/methodologies" title={t("methodologies")} />
              <FooterLink url="./cdp" title={t("submit-to-cdp")} />
            </VStack>
          </Box>
          <Box>
            <Link href="mailto:info@openearth.org">
              <Button h={"48px"} minW={"150px"} gap={3} borderRadius="48px">
                <Text
                  color="base.light"
                  fontFamily="heading"
                  fontSize="button.md"
                  fontWeight="medium"
                  letterSpacing="wider"
                  textTransform="uppercase"
                >
                  {t("contact-us")}
                </Text>
              </Button>
            </Link>
          </Box>
        </Box>
        <Box bg="body" h={1} />
        <Box display="flex" gap={4} alignItems="center" mt={12}>
          <Box mt={-1.5}>
            <Image
              src="/assets/powered_by_logo.svg"
              alt="openearth-logo"
              width={142}
              height={32}
            />
          </Box>
          <Text
            fontSize="title.sm"
            color="base.light"
            fontWeight="semibold"
            letterSpacing="wide"
          >
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <>v{currentVersion}</>
          </Text>
          <Box
            h={"20px"}
            w={"61px"}
            display="flex"
            alignItems="center"
            justifyContent="center"
            bg="border.neutral"
            borderRadius="20px"
          >
            <Text
              fontFamily="heading"
              fontSize="label.sm"
              color="content.primary"
              fontWeight="medium"
              letterSpacing="wide"
            >
              BETA
            </Text>
          </Box>
          <Text
            color="base.light"
            fontSize="body.md"
            letterSpacing="wide"
            lineHeight="20"
            fontWeight="regular"
          >
            {t("beta-text")}
          </Text>
          <Link
            href="/"
            color="base.light"
            fontSize="body.md"
            fontWeight="medium"
            letterSpacing="wide"
            textDecoration="underline"
            display="inline"
          >
            {t("send-feedback")}
          </Link>
        </Box>
      </Box>
    </Box>
  );
};

export default Footer;
