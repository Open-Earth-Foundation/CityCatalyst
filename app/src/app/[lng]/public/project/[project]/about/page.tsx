/* eslint-disable i18next/no-literal-string */
"use client";

import { use } from "react";
import {
  Box,
  Container,
  Grid,
  Heading,
  Text,
  List,
  HStack,
} from "@chakra-ui/react";
import Footer from "../components/Footer";
import NavigationBar from "../components/Navbar";
import Collaborators from "@/app/[lng]/public/project/[project]/components/Collaborators";
import { useTranslation } from "@/i18n/client";

const About = (props: {
  params: Promise<{ project: string; lng: string }>;
}) => {
  const { project, lng } = use(props.params);
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
        {/* Project Overview Section */}
        <Box py={16} px={{ base: 4, md: 8 }}>
          <Container maxW="7xl">
            <Box mb={12}>
              <Heading
                as="h2"
                size="sm"
                textTransform="uppercase"
                letterSpacing="wide"
                color="blue.500"
                mb={4}
              >
                Project Overview
              </Heading>
              <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={8}>
                <Box>
                  <Heading
                    as="h3"
                    fontSize={{ base: "2xl", md: "3xl" }}
                    mb={6}
                    color="gray.800"
                  >
                    Brazil is demonstrating bold climate leadership by aligning
                    subnational actions with its national commitments.
                  </Heading>
                  <Box color="gray.600" lineHeight="tall">
                    <Text mb={4}>
                      This project supports 50 municipalities across Brazil to
                      develop foundational climate diagnostics and priority
                      actions in line with the country&apos;s commitment to the{" "}
                      <Text as="span" fontWeight="semibold">
                        Coalition for High Ambition Multilevel Partnerships
                        (CHAMP)
                      </Text>
                      —a global initiative launched at COP28 to strengthen
                      coordination between national and subnational governments
                      for climate action.
                    </Text>
                    <Text>
                      In this effort, local governments are building Greenhouse
                      Gas (GHG) emissions inventories and Climate Risk and
                      Vulnerability Assessments (CCRAs), while identifying key
                      mitigation and adaptation measures aligned with
                      Brazil&apos;s national climate goals. These outputs are
                      integrated into a scalable digital platform to support
                      decision-making and track progress toward COP30 and
                      beyond.
                    </Text>
                  </Box>
                </Box>
                <Box ml="200px" borderRadius="xl">
                  <img
                    src="/assets/projects_dashboard/about_map_view.png"
                    alt="about map view"
                  />
                </Box>
              </Grid>
            </Box>
          </Container>
        </Box>

        {/* Purpose & Priorities Section */}
        <Box py={16} px={{ base: 4, md: 8 }} bg="gray.50">
          <Container maxW="7xl">
            <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={8}>
              <Box bg="gray.200" borderRadius="xl"></Box>
              <Box>
                <Heading as="h2" fontSize="2xl" color="gray.800" mb={6}>
                  Scale High Impact Climate Actions
                </Heading>
                <Text mb={4} color="gray.600">
                  This national initiative aims to:
                </Text>
                <List.Root color="gray.600">
                  <List.Item>
                    <Text as="span" fontWeight="semibold">
                      Advance Brazil&apos;s CHAMP commitment
                    </Text>{" "}
                    by embedding city-level data and actions into national
                    strategies like NDCs, NAPs, and LT-LEDS.
                  </List.Item>
                  <List.Item>
                    <Text as="span" fontWeight="semibold">
                      Support 50 cities
                    </Text>{" "}
                    with tailored emissions profiles and climate risk
                    assessments using publicly available datasets.
                  </List.Item>
                  <List.Item>
                    <Text as="span" fontWeight="semibold">
                      Prioritize climate actions
                    </Text>{" "}
                    that reflect local context and are ready for implementation
                    or financing.
                  </List.Item>
                  <List.Item>
                    <Text as="span" fontWeight="semibold">
                      Empower local governments
                    </Text>{" "}
                    through workshops, editable formats, and iterative
                    validation processes.
                  </List.Item>
                  <List.Item>
                    <Text as="span" fontWeight="semibold">
                      Provide a scalable model
                    </Text>{" "}
                    that can be extended to all Brazilian municipalities and
                    other CHAMP countries.
                  </List.Item>
                </List.Root>
              </Box>
            </Grid>
          </Container>
        </Box>

        {/* City Level Insights Section */}
        <Box py={16} px={{ base: 4, md: 8 }}>
          <Container maxW="7xl">
            <Box mb={12}>
              <Heading as="h2" fontSize="2xl" color="gray.800" mb={6}>
                EXPLORE CITY LEVEL INSIGHTS
              </Heading>
              <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={8}>
                <Box>
                  <Text mb={4} color="gray.600">
                    This platform offers access to structured, city-level
                    climate information:
                  </Text>
                  <List.Root spaceY={3} color="gray.600">
                    <List.Item>
                      <Text as="span" fontWeight="semibold">
                        Emissions Profiles
                      </Text>{" "}
                      – Based on national datasets (like SEEG), these summaries
                      highlight major sources of GHGs per city.
                    </List.Item>
                    <List.Item>
                      <Text as="span" fontWeight="semibold">
                        Risk and Vulnerability Assessments
                      </Text>{" "}
                      – Using data from platforms like AdaptaBrasil, these
                      identify local exposure to climate hazards.
                    </List.Item>
                    <List.Item>
                      <Text as="span" fontWeight="semibold">
                        Priority Actions
                      </Text>{" "}
                      – Each city features at least one prioritized mitigation
                      and one adaptation measure, informed by local needs and
                      national alignment.
                    </List.Item>
                    <List.Item>
                      <Text as="span" fontWeight="semibold">
                        Comparative Views
                      </Text>{" "}
                      – Filter and compare metrics across cities to understand
                      patterns, opportunities, and gaps.
                    </List.Item>
                  </List.Root>
                  <Text mt={4} color="gray.600">
                    This information supports national policy design, financing
                    decisions, and transparency for international reporting.
                  </Text>
                </Box>
                <Box ml="200px">
                  <img
                    src="/assets/projects_dashboard/about_insights.png"
                    alt="about insights"
                  />
                </Box>
              </Grid>
            </Box>
          </Container>
        </Box>
        <Box py={16} px={{ base: 6, md: 10, lg: 16 }} bg="#0D8A3F">
          <Container maxW="7xl">
            <Heading
              as="h2"
              fontSize="3xl"
              fontWeight="bold"
              color="white"
              mb={8}
            >
              Why it matters
            </Heading>

            <HStack
              flexDirection="column"
              gap={6}
              maxW="3xl"
              color="whiteAlpha.900"
              align="start"
            >
              <Text>
                Cities are at the forefront of climate action, facing its
                impacts while holding keys to innovative solutions. Yet, many
                lack the resources and capacity to develop robust climate action
                plans. This platform bridges this gap, offering cities tailored
                analysis, accessible data, and prioritized interventions.
              </Text>

              <Text>
                The project demonstrates the power of multilevel climate action,
                where national resources and frameworks effectively support
                local planning, knowledge sharing, and implementation. Through
                technology and standardized approaches, it creates a scalable
                model for city climate planning that can be replicated across
                different contexts.
              </Text>
            </HStack>
          </Container>
        </Box>
        <Collaborators lng={lng} project={project} />
      </Box>
      <Footer {...footerProps} />
    </Box>
  );
};

export default About;
