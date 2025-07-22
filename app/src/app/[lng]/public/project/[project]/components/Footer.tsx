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
    <Box bg="#010018" py={6} px={6} color="white" w="100%">
      <Box
        maxW="7xl"
        mx="auto"
        display="flex"
        flexDirection={{ base: "column", lg: "row" }}
        justifyContent="space-between"
        alignItems="center"
      >
        {/* Copyright text */}
        <Box mb={{ base: 4, lg: 0 }} fontSize="sm" color="gray.300">
          {copyright}
        </Box>

        {/* Powered by section */}
        <Box
          display="flex"
          alignItems="center"
          gap={4}
          mb={{ base: 4, lg: 0 }}
          order={{ base: -1, lg: "unset" }}
        >
          <Text fontSize="sm" color="gray.300">
            Powered by open technology from
          </Text>
          <Box display="flex" alignItems="center" gap={3}>
            <a
              href="https://openearth.org"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-block" }}
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
        <Box display="flex" gap={6}>
          {links.map((link, index) => (
            <a
              key={index}
              href={link.href}
              style={{
                fontSize: "0.875rem",
                color: "#D1D5DB",
                transition: "color 0.2s",
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = "#fff")}
              onMouseOut={(e) => (e.currentTarget.style.color = "#D1D5DB")}
            >
              {link.label}
            </a>
          ))}
        </Box>
      </Box>
    </Box>
  );
};

export default Footer;
