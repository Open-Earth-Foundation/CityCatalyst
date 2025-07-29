import { Box, Heading, Text, Link } from "@chakra-ui/react";

/**
 * Hero section with title, description and call-to-action
 * @param overviewLabel - Small label above the main heading
 * @param heading - The main headline for the hero section
 * @param mainParagraph - First paragraph of descriptive text
 * @param secondaryParagraph - Second paragraph of descriptive text
 * @param ctaText - Text for the call-to-action button
 * @param ctaLink - Link for the call-to-action button
 */

interface HeroProps {
  overviewLabel: string;
  heading: string;
  mainParagraph: string;
  secondaryParagraph: string;
  ctaText: string;
  ctaLink: string;
}

const Hero = () => {
  const heroText = {
    overviewLabel: "PROJECT OVERVIEW",
    heading: "Brazilian cities are stepping up for climate action.",
    mainParagraph:
      "As part of the CHAMP commitment—a global initiative to align local and national climate efforts—50 cities are advancing mitigation and adaptation strategies ahead of COP30.",
    secondaryParagraph:
      "This platform presents data-driven profiles built from public datasets to inform and scale climate action across municipalities. Explore city-level emissions, climate risks, and prioritized actions from across Brazil.",
    ctaText: "MORE ABOUT CHAMP BRAZIL",
    ctaLink: "/about",
  };

  return (
    <Box
      as="section"
      position="relative"
      py={32}
      px={6}
      backgroundImage={`linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.5)), url(/assets/projects_dashboard/rio_background.png)`}
      backgroundSize="cover"
      backgroundPosition="center"
      minHeight="100vh"
    >
      <Box maxW="7xl" mx="auto" position="relative" zIndex={10} pt={20}>
        {/* Overview label */}
        <Text
          color="gray.100"
          textTransform="uppercase"
          fontSize="sm"
          letterSpacing="wider"
          fontWeight="medium"
          mb={4}
        >
          {heroText.overviewLabel}
        </Text>

        {/* Main heading */}
        <Heading
          fontSize={{ base: "4xl", md: "6xl" }}
          fontWeight="bold"
          mb={8}
          color="white"
          lineHeight="tight"
        >
          {heroText.heading}
        </Heading>

        {/* First descriptive paragraph */}
        <Text color="white" fontSize="base" maxW="2xl" mb={6}>
          {heroText.mainParagraph}
        </Text>

        {/* Second descriptive paragraph */}
        <Text color="white" fontSize="base" maxW="2xl" mb={10}>
          {heroText.secondaryParagraph}
        </Text>

        {/* Call-to-action button */}
        <Box>
          <Link
            href={heroText.ctaLink}
            display="inline-block"
            px={8}
            py={3}
            borderRadius="full"
            borderWidth={2}
            borderColor="white"
            color="white"
            textTransform="uppercase"
            fontSize="sm"
            letterSpacing="wider"
            fontWeight="medium"
            _hover={{ bg: "rgba(255, 255, 255, 0.1)" }}
            transition="all 0.2s"
          >
            {heroText.ctaText}
          </Link>
        </Box>
      </Box>
    </Box>
  );
};

export default Hero;
