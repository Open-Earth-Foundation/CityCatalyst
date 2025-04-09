import { Box } from "@chakra-ui/react";

export interface FooterProps {
  copyright: string;
  links: Array<{
    label: string;
    href: string;
  }>;
}

const Footer = ({ copyright, links }: FooterProps) => {
  return (
    <Box className="bg-white py-8 px-6 border-t border-gray-200">
      <Box className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center">
        {/* Copyright text */}
        <Box className="mb-4 md:mb-0 text-sm text-gray-600">{copyright}</Box>

        {/* Footer links */}
        <Box className="flex gap-6">
          {links.map((link, index) => (
            <a
              key={index}
              href={link.href}
              className="text-sm text-gray-600 hover:text-primary transition-colors"
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
