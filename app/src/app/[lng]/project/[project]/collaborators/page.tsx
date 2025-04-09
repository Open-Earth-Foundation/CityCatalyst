"use client";
import {
  Box,
  Container,
  Text,
  Heading,
  VStack,
  Grid,
  Flex,
  Image,
  Strong,
} from "@chakra-ui/react";
import Footer from "../components/Footer";
import NavigationBar from "../components/Navbar";

import brazilMinistryLogo from "@/assets/brazil_ministry_logo.png";
import cdpLogo from "@/assets/cdp_logo.png";
import c40CitiesLogo from "@/assets/c40_cities_logo.png";
import globalCovenantLogo from "@/assets/global_covenant_logo.png";

const Collaborators = ({
  params: { project, lng },
}: {
  params: { project: string; lng: string };
}) => {
  const footerProps = {
    copyright: "© 2025 CHAMP Brazil Cities Initiative",
    links: [
      { label: "Privacy Policy", href: "#privacy" },
      { label: "Terms of Use", href: "#terms" },
      { label: "Contact", href: "#contact" },
    ],
  };
  return (
    <Box minH="100vh" display="flex" flexDirection="column">
      <NavigationBar lng={lng} project={project} />
      <Box as="main" flexGrow={1}>
        {/* Example conversion for just one section, all others follow this pattern */}
        <Box py={16} px={{ base: 6, md: 10, lg: 16 }}>
          <Container maxW="7xl" py="10">
            <Heading
              fontSize="display.md"
              fontWeight="bold"
              letterSpacing="wide"
              color="content.secondary"
              mb={8}
            >
              Advanced collaboration
            </Heading>
            <Text fontSize="body.lg" color="gray.900" mt={2} mb={8} maxW="3xl">
              This project is the result of a multistakeholder collaboration,
              combining national leadership, international networks, technical
              innovation, and local expertise. Together, these organizations
              have supported 50 Brazilian cities in developing foundational
              climate diagnostics and actionable pathways, aligning local action
              with Brazil's national climate commitments and the global CHAMP
              pledge.
            </Text>
          </Container>
          <Container maxW="7xl" py="10">
            <Heading
              fontSize="display.md"
              fontWeight="bold"
              letterSpacing="wide"
              color="content.secondary"
              mb={8}
            >
              Project Hosts
            </Heading>
            <Text fontSize="body.lg" color="gray.900" mt={2} mb={8} maxW="3xl">
              <Text mb={10}>
                <Strong>
                  This project is carried out under the leadership and
                  coordination of the Brazilian Federal Government, ensuring
                  national alignment and integration into Brazil’s climate
                  strategies.
                </Strong>
              </Text>
              <Text mb={2}>
                <Strong>
                  Ministry of Environment and Climate Change (MMA)
                </Strong>
              </Text>
              The MMA leads Brazil’s national climate agenda and plays a central
              role in coordinating the development of the country’s NDCs, the
              National Adaptation Plan (NAP), and related climate policies. For
              this project, the Ministry ensures strategic alignment between
              city-level diagnostics and Brazil’s national climate commitments.
              <Text mb={2} mt={2}>
                <Strong>Ministry of Cities</Strong>
              </Text>
              Focused on urban development and infrastructure, the Ministry of
              Cities supports municipal-level engagement and helped embed this
              initiative within the broader context of Brazilian urban policy.
              Their involvement ensures climate planning is integrated into the
              everyday governance of Brazilian cities.
            </Text>
          </Container>
          <Container maxW="7xl" py="10">
            <Heading
              fontSize="display.md"
              fontWeight="bold"
              letterSpacing="wide"
              color="content.secondary"
              mb={8}
            >
              Project Sponsors and Producers
            </Heading>
            <Text fontSize="body.lg" color="gray.900" mt={2} mb={8} maxW="3xl">
              <Text mb={10}>
                <Strong>
                  This initiative was launched through a call for proposals by
                  leading global climate organizations, with financial and
                  strategic backing from philanthropic partners.
                </Strong>
              </Text>
              <Text mb={2} mt={2}>
                <Strong>C40 Cities</Strong>
              </Text>
              A global network of leading cities committed to addressing the
              climate crisis, C40 played a key role in designing and
              coordinating the initiative’s launch. Through its technical
              leadership and oversight, C40 ensures alignment with global best
              practices and a direct connection to the CHAMP framework.
              <Text mb={2} mt={4}>
                <Strong>
                  Global Covenant of Mayors for Climate & Energy (GCoM)
                </Strong>
              </Text>
              GCoM is the world’s largest alliance for city climate leadership.
              In this project, GCoM supported the call for proposals and
              framework integration, ensuring participating cities advance along
              a recognized global climate action pathway.
              <Text mb={2} mt={4}>
                <Strong>CDP</Strong>
              </Text>
              CDP provides the global standard for environmental disclosure. As
              part of the project producers, CDP contributed guidance to ensure
              transparency and harmonization of emissions reporting with
              international frameworks.
              <Text mb={2} mt={4}>
                <Strong>Bloomberg Philanthropies</Strong>
              </Text>
              As the primary funder, Bloomberg Philanthropies underwrites the
              program and supports the broader CHAMP mission of strengthening
              multilevel governance. Their support reflects a strategic
              investment in accelerating climate action across Global South
              cities.
            </Text>
          </Container>
        </Box>

        {/* Additional sections would follow similar Chakra UI structure */}
        {/* You can replicate using <Box>, <Container>, <Grid>, <Flex>, <Image>, <Text>, <Heading>, <VStack> */}
      </Box>
      <Footer {...footerProps} />
    </Box>
  );
};

export default Collaborators;
