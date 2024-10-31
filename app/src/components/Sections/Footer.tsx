import { Box, Button, Heading, Text } from "@chakra-ui/react";
import Image from "next/image";
import { Link } from "@chakra-ui/react";
import React from "react";
import FooterLink from "../Navigation/FooterLink";
import { TFunction } from "i18next";
import { useTranslation } from "@/i18n/client";
import { getCurrentVersion } from "@/util/helpers";

const Footer = ({ lng }: { lng: string }) => {
  const currentVersion = getCurrentVersion();
  const { t } = useTranslation(lng, "footer");
  return (
    <footer className="w-full h-[320px] bg-[#00001f] pt-[48px]">
      <Box className="w-full px-[64px]">
        <Box className="flex justify-between w-full pb-10">
          <Box>
            <Image
              src="/assets/city_catalyst_logo.svg"
              alt="city-catalyst-logo"
              width={121}
              height={24}
            />
          </Box>
          <Box
            fontFamily="heading"
            className="text-white text-[14px] w-[60%] grid grid-cols-3  gap-6 font-poppins"
          >
            <FooterLink
              url="https://citycatalyst.openearth.org/"
              title={t("about-citycatalyst")}
            />
            <FooterLink
              url="https://github.com/Open-Earth-Foundation/OpenClimate/blob/develop/CONTRIBUTING.md"
              title={t("contribution-guide")}
            />
            <FooterLink
              url="https://github.com/Open-Earth-Foundation/CityCatalyst"
              title={t("goto-gh")}
            />
            <FooterLink
              url="https://wiki.climatedata.network/"
              title={t("cad")}
            />
            <FooterLink
              url="https://github.com/Open-Earth-Foundation/CityCatalyst/wiki"
              title={t("read-the-docs")}
            />
            <FooterLink url="./cdp" title={t("submit-to-cdp")} />
          </Box>
          <Box>
            <Link href="mailto:info@openearth.org">
              <Button
                variant="solid"
                className="h-[48px] w-[150px] gap-3 rounded-full"
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
        <Box backgroundColor="body" className="h-[1px]" />
        <Box className="pt-[48px] flex justify-between">
          <Box className="flex gap-4">
            <Text
              fontSize="title.sm"
              color="base.light"
              fontWeight="semibold"
              letterSpacing="wide"
            >
              v{currentVersion}
            </Text>
            <Box
              backgroundColor="border.neutral"
              borderRadius="full"
              className="h-[20px] w-[61px] flex items-center justify-center"
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
            >
              {t("send-feedback")}
            </Link>
          </Box>
          <Image
            src="/assets/powered_by_logo.svg"
            alt="openearth-logo"
            width={142}
            height={32}
          />
        </Box>
      </Box>
    </footer>
  );
};

export default Footer;
