/* eslint-disable i18next/no-literal-string */
"use client";;
import { use } from "react";

import { Box, Container, Text, Heading, Flex, Strong } from "@chakra-ui/react";
import Footer from "../components/Footer";
import NavigationBar from "../components/Navbar";
import Image from "next/image";
import { useTranslation } from "@/i18n/client";

const Collaborators = (
  props: {
    params: Promise<{ project: string; lng: string }>;
  }
) => {
  const params = use(props.params);

  const {
    project,
    lng
  } = params;

  const { t } = useTranslation(lng, "dashboard");

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
      <NavigationBar lng={lng} project={project} t={t} />
      <Box as="main" flexGrow={1}>
        {/* Example conversion for just one section, all others follow this pattern */}
        <Box py={16} px={{ base: 6, md: 10, lg: 16 }} w="full" bg="white">
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
              with Brazil&apos;s national climate commitments and the global
              CHAMP pledge.
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
            <Box fontSize="body.lg" w="full" color="gray.900" mt={2} mb={8}>
              <Text mb={10} maxW="3xl">
                <Strong>
                  This project is carried out under the leadership and
                  coordination of the Brazilian Federal Government, ensuring
                  national alignment and integration into Brazil’s climate
                  strategies.
                </Strong>
              </Text>
              <Flex justifyContent="space-between" alignItems="center">
                <Text maxW="3xl">
                  <Text mb={2}>
                    <Strong>
                      Ministry of Environment and Climate Change (MMA)
                    </Strong>
                  </Text>
                  The MMA leads Brazil’s national climate agenda and plays a
                  central role in coordinating the development of the country’s
                  NDCs, the National Adaptation Plan (NAP), and related climate
                  policies. For this project, the Ministry ensures strategic
                  alignment between city-level diagnostics and Brazil’s national
                  climate commitments.
                </Text>
                <Image
                  src="/assets/projects_dashboard/mma_big.png"
                  alt="Brazilian Government"
                  width={363}
                  height={132}
                />
              </Flex>
              <Flex justifyContent="space-between">
                <Text maxW="3xl">
                  <Text mb={2} mt={2}>
                    <Strong>Ministry of Cities</Strong>
                  </Text>
                  Focused on urban development and infrastructure, the Ministry
                  of Cities supports municipal-level engagement and helped embed
                  this initiative within the broader context of Brazilian urban
                  policy. Their involvement ensures climate planning is
                  integrated into the everyday governance of Brazilian cities.
                </Text>
                <Image
                  src="/assets/projects_dashboard/moc.png"
                  alt="ministry of cities"
                  width={369}
                  height={137}
                />
              </Flex>
            </Box>
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
            <Box fontSize="body.lg" color="gray.900" mt={2} mb={8}>
              <Text mb={10} maxW="3xl">
                <Strong>
                  This initiative was launched through a call for proposals by
                  leading global climate organizations, with financial and
                  strategic backing from philanthropic partners.
                </Strong>
              </Text>
              <Flex justifyContent="space-between">
                <Text maxW="3xl">
                  <Text mb={2} mt={2}>
                    <Strong>C40 Cities</Strong>
                  </Text>
                  A global network of leading cities committed to addressing the
                  climate crisis, C40 played a key role in designing and
                  coordinating the initiative’s launch. Through its technical
                  leadership and oversight, C40 ensures alignment with global
                  best practices and a direct connection to the CHAMP framework.
                </Text>
                <Image
                  src="/assets/projects_dashboard/c40_cities_logo.png"
                  alt="c40 cities"
                  width={100}
                  height={100}
                />
              </Flex>
              <Flex justifyContent="space-between" mt={10}>
                <Text maxW="3xl">
                  <Text mb={2} mt={4}>
                    <Strong>
                      Global Covenant of Mayors for Climate & Energy (GCoM)
                    </Strong>
                  </Text>
                  GCoM is the world’s largest alliance for city climate
                  leadership. In this project, GCoM supported the call for
                  proposals and framework integration, ensuring participating
                  cities advance along a recognized global climate action
                  pathway.
                </Text>
                <Image
                  src="/assets/projects_dashboard/gcom_big.png"
                  alt="gcom"
                  width={215}
                  height={120}
                />
              </Flex>
              <Flex justifyContent="space-between" mt={10}>
                <Text maxW="3xl">
                  <Text mb={2} mt={4}>
                    <Strong>CDP</Strong>
                  </Text>
                  CDP provides the global standard for environmental disclosure.
                  As part of the project producers, CDP contributed guidance to
                  ensure transparency and harmonization of emissions reporting
                  with international frameworks.
                </Text>
                <Image
                  src="/assets/projects_dashboard/cdp_big.png"
                  alt="cdp"
                  width={198}
                  height={91}
                />
              </Flex>
              <Flex justifyContent="space-between" mt={10} alignItems="center">
                <Text maxW="3xl">
                  <Text mb={2} mt={4}>
                    <Strong>Bloomberg Philanthropies</Strong>
                  </Text>
                  As the primary funder, Bloomberg Philanthropies underwrites
                  the program and supports the broader CHAMP mission of
                  strengthening multilevel governance. Their support reflects a
                  strategic investment in accelerating climate action across
                  Global South cities.
                </Text>
                <Image
                  src="/assets/projects_dashboard/bloomberg_big.png"
                  alt="bloomberg"
                  width={275}
                  height={86}
                />
              </Flex>
            </Box>
          </Container>
          <Container maxW="7xl" py="10">
            <Heading
              fontSize="display.md"
              fontWeight="bold"
              letterSpacing="wide"
              color="content.secondary"
              mb={8}
            >
              Technology Providers
            </Heading>
            <Box fontSize="body.lg" color="gray.900" mt={2} mb={8}>
              <Text mb={8}>
                <Strong>
                  Open-source digital infrastructure for climate data processing
                  and planning
                </Strong>
              </Text>
              <Flex justifyContent="space-between" alignItems="center">
                <Text maxW="3xl">
                  <Text mb={2} mt={2}>
                    <Strong>Open Earth Foundation</Strong>
                  </Text>
                  OpenEarth Foundation OpenEarth is a non-profit organization
                  developing open digital systems to accelerate climate
                  resilience. In this project, it leads the technical
                  architecture through the CityCatalyst platform, enabling the
                  automated generation of GHG inventories and climate risk
                  assessments for each participating city.
                </Text>
                <Image
                  src="/assets/projects_dashboard/openearth_big.png"
                  alt="openearth"
                  width={221}
                  height={50}
                />
              </Flex>
            </Box>
          </Container>
          <Container maxW="7xl" py="10">
            <Heading
              fontSize="display.md"
              fontWeight="bold"
              letterSpacing="wide"
              color="content.secondary"
              mb={8}
            >
              Local consultant & implementers
            </Heading>
            <Box fontSize="body.lg" color="gray.900" mt={2} mb={8}>
              <Text mb={10}>
                <Strong>
                  National technical experts ﻿engaged in city-level
                  implementation and workshops.
                </Strong>
              </Text>
              <Flex justifyContent="space-between" alignItems="center">
                <Text maxW="3xl">
                  <Text mb={2} mt={2}>
                    <Strong>I Care Brasil</Strong>
                  </Text>
                  I Care Brasil is a sustainability consultancy with deep
                  expertise in climate action planning. As the technical lead on
                  the ground, they were responsible for producing city-level
                  diagnostics, coordinating local workshops, and refining
                  mitigation and adaptation measures with municipal
                  stakeholders.
                </Text>
                <Image
                  src="/assets/projects_dashboard/icare_big.png"
                  alt="openearth"
                  width={131}
                  height={60}
                />
              </Flex>
              <Flex justifyContent="space-between" alignItems="center" mt={10}>
                <Text maxW="3xl">
                  <Text mb={2} mt={2}>
                    <Strong>Brisa Soluções</Strong>
                  </Text>
                  Ambientais Brisa provided support in contextualizing technical
                  analyses and tailoring mitigation and adaptation measures to
                  the socio-environmental realities of participating cities.
                </Text>
              </Flex>
            </Box>
          </Container>
          <Container maxW="7xl" py="10">
            <Heading
              fontSize="display.md"
              fontWeight="bold"
              letterSpacing="wide"
              color="content.secondary"
              mb={8}
            >
              Local city networks & engagement <br /> partners
            </Heading>
            <Box fontSize="body.lg" color="gray.900" mt={2} mb={8}>
              <Text mb={10}>
                <Strong>
                  Organizations supporting municipal participation and peer
                  learning.
                </Strong>
              </Text>
              <Flex justifyContent="space-between" alignItems="center">
                <Text maxW="3xl">
                  <Text mb={2} mt={2}>
                    <Strong>Frente Nacional de Prefeitos (FNP)</Strong>
                  </Text>
                  FNP is a prominent network representing Brazilian mayors. It
                  facilitated municipal engagement, promoted peer learning, and
                  helped ensure political buy-in across the 50 participating
                  cities.
                </Text>
                <Image
                  src="/assets/projects_dashboard/fnp.png"
                  alt="fnp"
                  width={133}
                  height={58}
                />
              </Flex>
              <Flex
                justifyContent="space-between"
                gap="10"
                alignItems="center"
                mt={10}
              >
                <Text maxW="3xl">
                  <Text mb={2} mt={2}>
                    <Strong>ICLEI Brasil</Strong>
                  </Text>
                  ICLEI Brasil supports local governments on their
                  sustainability journeys. For this initiative, ICLEI
                  contributed to technical support, city capacity-building, and
                  dissemination of methodologies for long-term local adoption.
                </Text>
                <Image
                  src="/assets/projects_dashboard/iclei.png"
                  alt="iclei"
                  width={96}
                  height={96}
                />
              </Flex>
            </Box>
          </Container>
          <Container maxW="7xl" py="10">
            <Heading
              fontSize="display.md"
              fontWeight="bold"
              letterSpacing="wide"
              color="content.secondary"
              mb={8}
            >
              Data providers
            </Heading>
            <Box fontSize="body.lg" color="gray.900" mt={2} mb={8}>
              <Text mb={10}>
                <Strong>
                  These platforms provided the foundational data for emissions
                  and climate risk assessments.
                </Strong>
              </Text>
              <Flex justifyContent="space-between" alignItems="center">
                <Text maxW="3xl">
                  SEEG (Sistema de Estimativas de Emissões de GEE) SEEG offers
                  robust subnational emissions estimates and served as the
                  backbone for the GHG inventory work. Its publicly accessible
                  data enabled rapid, transparent generation of baseline city
                  profiles
                </Text>
                <Image
                  src="/assets/projects_dashboard/seeg.png"
                  alt="seeg"
                  width={106}
                  height={47}
                />
              </Flex>
              <Flex
                justifyContent="space-between"
                gap="10"
                alignItems="center"
                mt={10}
              >
                <Text maxW="3xl">
                  <Text mb={2} mt={2}>
                    <Strong>AdaptaBrasil</Strong>
                  </Text>
                  As Brazil’s primary climate risk platform, AdaptaBrasil
                  provided detailed datasets on hazards and vulnerabilities,
                  which were essential for constructing the Climate Risk and
                  Vulnerability Assessments (CCRAs).
                </Text>
                <Image
                  src="/assets/projects_dashboard/adapta-brazil.png"
                  alt="adapta brazil"
                  width={98}
                  height={41}
                />
              </Flex>
              <Flex
                justifyContent="space-between"
                gap="10"
                alignItems="center"
                mt={10}
              >
                <Text maxW="3xl">
                  <Text mb={2} mt={2}>
                    <Strong>Climate Trace</Strong>
                  </Text>
                  Climate TRACE uses satellite data and AI to monitor global
                  emissions. It was used in this project to enhance data quality
                  and spatial validation, supporting emissions profiling with
                  independent verification
                </Text>
                <Image
                  src="/assets/projects_dashboard/climate-trace.png"
                  alt="fnp"
                  width={116}
                  height={50}
                />
              </Flex>
            </Box>
          </Container>
        </Box>
      </Box>
      <Footer {...footerProps} />
    </Box>
  );
};

export default Collaborators;
