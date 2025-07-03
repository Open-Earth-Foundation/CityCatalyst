/* eslint-disable i18next/no-literal-string */
import { Box, Text } from "@chakra-ui/react";
import Image from "next/image";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";

export interface FooterProps {
  copyright: string;
  links: Array<{
    label: string;
    href: string;
  }>;
}

const Footer = ({ copyright, links }: FooterProps) => {
  const { organization } = useOrganizationContext();
  return (
    <Box className="bg-[#010018] py-6 px-6 text-white" w="100%">
      <Box className="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between items-center">
        {/* Copyright text */}
        <Box className="mb-4 lg:mb-0 text-sm text-gray-300">{copyright}</Box>

        {/* Powered by section */}
        <Box className="flex items-center gap-4 mb-4 lg:mb-0 order-first lg:order-0">
          <Text className="text-sm text-gray-300">
            Powered by open technology from
          </Text>
          <Box className="flex items-center gap-3">
            <a
              href="https://openearth.org"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block"
            >
              {organization.logoUrl ? (
                <img
                  src={organization.logoUrl}
                  height={40}
                  width={250}
                  alt="Org logo"
                />
              ) : (
                <Image
                  src="/assets/logo.svg"
                  width={36}
                  height={36}
                  alt="CityCatalyst logo"
                />
              )}
            </a>
          </Box>
        </Box>

        {/* Footer links */}
        <div className="flex gap-6">
          {links.map((link, index) => (
            <a
              key={index}
              href={link.href}
              className="text-sm text-gray-300 hover:text-white transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>
      </Box>
    </Box>
  );
};

export default Footer;
