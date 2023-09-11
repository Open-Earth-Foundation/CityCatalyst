import { Box, Button, Heading, Text } from "@chakra-ui/react";
import Image from "next/image";
import { Link } from "@chakra-ui/react";
import React from "react";
import FooterLink from "../Navigation/FooterLink";

const Footer = () => {
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
            <FooterLink url="/" title="About Open Climate" />
            <FooterLink url="/" title="Contribution Guide" />
            <FooterLink url="/" title="Go to GitHub" />
            <FooterLink url="/" title="CAD2.0 Community" />
            <FooterLink url="/" title="Read the docs" />
            <FooterLink url="/" title="Python Client" />
          </Box>
          <Box>
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
                contact us
              </Text>
            </Button>
          </Box>
        </Box>
        <Box backgroundColor="body" className="h-[1px]" />
        <Box className="pt-[48px] flex justify-between">
          <Box className="flex gap-5">
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
              This site is a beta version, we appreciate all feedback to improve
              the platform
            </Text>
            <Link
              href="/"
              color="base.light"
              fontSize="body.md"
              fontWeight="medium"
              letterSpacing="wide"
              textDecoration="underline"
            >
              Send Feedback
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
