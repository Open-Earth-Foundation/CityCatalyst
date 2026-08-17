import { Box, Button, Text, VStack } from "@chakra-ui/react";
import Image from "next/image";
import { Link } from "@chakra-ui/react";
import React from "react";
import FooterLink from "../Navigation/FooterLink";
import { useTranslation } from "@/i18n/client";
import { getCurrentVersion } from "@/util/helpers";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";
import { TitleSmall } from "@/components/package/Texts/Title";

const FEEDBACK_FORM_URLS: Record<string, string> = {
  en: "https://docs.google.com/forms/d/e/1FAIpQLSded7MUlIafwYvhLNq9Hyq4tQtTfpqGTp8j6X4zwywl6bUTmQ/viewform",
  pt: "https://docs.google.com/forms/d/e/1FAIpQLSdNDYSa5j96ahtJYnkvbQAnSJaGm-fAnO-tINBMIu7ggyQqIQ/viewform",
};

const Footer = ({ lng }: { lng: string }) => {
  const currentVersion = getCurrentVersion();
  const { t } = useTranslation(lng, "footer");
  const { organization } = useOrganizationContext();
  const logoUrl = organization?.logoUrl;
  const feedbackFormUrl = FEEDBACK_FORM_URLS[lng] ?? FEEDBACK_FORM_URLS.en;
  return (
    <Box as="footer" w="full" bg="#00001f" pt={12} pb={20}>
      <Box w="full" px={16}>
        <Box display="flex" w="full" pb={12} gap="xxl-7">
          <Box>
            {logoUrl ? (
              <Image src={logoUrl} width={200} height={40} alt="Org logo" />
            ) : (
              <Image
                src="/assets/city_catalyst_logo.svg"
                alt="city-catalyst-logo"
                width={121}
                height={24}
                style={{ marginLeft: "11.5px", marginRight: "11.5px" }}
              />
            )}
          </Box>
          <Box
            color="white"
            fontSize="14px"
            w="60%"
            display="grid"
            gridTemplateColumns="repeat(3, 1fr)"
            gap="xxl-2"
            fontFamily="poppins"
          >
            <VStack align="flex-start" gap="l">
              <TitleSmall color="background.overlay" textTransform="uppercase">
                {t("about")}
              </TitleSmall>
              <FooterLink
                url="https://citycatalyst.openearth.org/"
                title={t("about-citycatalyst")}
              />
              <FooterLink
                url="https://citycatalyst.openearth.org/privacy"
                title={t("our-privacy-policy")}
              />
            </VStack>
            <VStack align="flex-start" gap="l">
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

            <VStack align="flex-start" gap="l">
              <TitleSmall color="background.overlay" textTransform="uppercase">
                {t("resources")}
              </TitleSmall>
              <FooterLink url="/methodologies" title={t("methodologies")} />
            </VStack>
          </Box>
          <Box>
            <Link href="mailto:info@openearth.org">
              <Button
                h="auto"
                minW="172px"
                gap="s"
                borderRadius="48px"
                py="l"
                px="l"
              >
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
          <Link
            href={feedbackFormUrl}
            target="_blank"
            rel="noopener noreferrer"
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
