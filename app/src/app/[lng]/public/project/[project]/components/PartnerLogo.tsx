import { Box, SimpleGrid, Image } from "@chakra-ui/react";

interface PartnerLogo {
  id: string;
  name: string;
  logo?: string;
}

interface PartnerLogosProps {
  partners: PartnerLogo[];
}

const PartnerLogos = ({ partners }: PartnerLogosProps) => {
  return (
    <Box
      as="section"
      py={12}
      px={6}
      bg="white"
      borderTopWidth={1}
      borderColor="gray.100"
    >
      <Box maxW="7xl" mx="auto">
        <SimpleGrid
          columns={{ base: 2, sm: 3, md: 5, lg: 6 }}
          gap={8}
          alignItems="center"
          justifyItems="center"
        >
          {partners.map((partner) => (
            <Box
              key={partner.id}
              h={10}
              display="flex"
              alignItems="center"
              justifyContent="center"
              aria-label={`Logo of ${partner.name}`}
            >
              {partner.logo && (
                <Image
                  src={partner.logo}
                  alt={partner.name}
                  maxH="full"
                  maxW="full"
                  objectFit="contain"
                  _hover={{ opacity: 1, filter: "grayscale(0)" }}
                  transition="all 0.3s"
                />
              )}
            </Box>
          ))}
        </SimpleGrid>
      </Box>
    </Box>
  );
};

export default PartnerLogos;
