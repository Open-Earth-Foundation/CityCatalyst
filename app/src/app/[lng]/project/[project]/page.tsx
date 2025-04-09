/* eslint-disable i18next/no-literal-string */
"use client";

import { useState } from "react";
import { api } from "@/services/api";
import ProjectMap from "./ProjectMap";
import { NavigationBar } from "@/components/navigation-bar";
import { Box, Button, Card, Center, HStack, VStack } from "@chakra-ui/react";
import Footer from "./components/Footer";
import Hero from "@/app/[lng]/project/[project]/components/Hero";
import PartnerLogos from "@/app/[lng]/project/[project]/components/PartnerLogo";
import Metrics from "@/app/[lng]/project/[project]/components/Metrics";
import Link from "next/link";
import { TitleLarge } from "@/components/Texts/Title";
import LabelLarge from "@/components/Texts/Label";

export interface PartnerLogo {
  id: string;
  name: string;
  logo?: string;
}

const footerProps = {
  copyright: "© 2025 CHAMP Brazil Cities Initiative",
  links: [
    { label: "Privacy Policy", href: "#privacy" },
    { label: "Terms of Use", href: "#terms" },
    { label: "Contact", href: "#contact" },
  ],
};

const partners: PartnerLogo[] = [
  {
    id: "1",
    name: "CDP - Disclosure Insight Action",
    logo: "/assets/projects_dashboard/cdp_logo.png",
  },
  {
    id: "2",
    name: "Ministério do Meio Ambiente e Mudança do Clima",
    logo: "/assets/projects_dashboard/brazil_ministry_logo.png",
  },
  {
    id: "3",
    name: "C40 Cities",
    logo: "/assets/projects_dashboard/c40_cities_logo.png",
  },
  {
    id: "4",
    name: "Global Covenant of Mayors for Climate & Energy",
    logo: "/assets/projects_dashboard/global_covenant.png",
  },
];

interface MetricItem {
  value: number | string;
  label: string;
}

function LinkCard({
  title,
  description,
  link,
  methodologyLink,
}: {
  title: string;
  description: string;
  link: string;
  methodologyLink: string;
}) {
  return (
    <Card.Root rounded={8}>
      <Card.Body borderRadius={8}>
        <VStack spaceY={4} alignItems="left">
          <TitleLarge color="interactive.secondary">{title}</TitleLarge>
          <LabelLarge>{description}</LabelLarge>
          <Link href={link} target="_blank" rel="noopener noreferrer">
            <Button w="full">SEE RESULTS</Button>
          </Link>
          <Link
            href={methodologyLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            More about the methodology
          </Link>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

export default function ProjectPage({
  params: { project, lng },
}: {
  params: { project: string; lng: string };
}) {
  const {
    data: projectSummary,
    isLoading,
    error,
  } = api.useGetProjectSummaryQuery(project!, {
    skip: !project,
  });
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);

  // Metrics section content
  const metricsProps = {
    title: "Impact",
    description:
      "Real-time data from Brazilian cities participating in the CHAMP initiative",
    metrics: [
      {
        value: projectSummary?.totalCities,
        label: "Cities",
      },
      {
        value: projectSummary?.totalEmissions,
        label: "Total Emissions",
      },
      {
        value: projectSummary?.totalPopulation,
        label: "Population",
      },
      {
        value: projectSummary?.totalDataSources,
        label: "Data Sources",
      },
    ] as MetricItem[],
  };

  return (
    <VStack className="min-h-screen" gap={0} flexDirection="column">
      <NavigationBar lng={lng} isPublic />
      <Box flex={1} className="flex-grow" w="100%">
        <Hero />
        <PartnerLogos partners={partners} />
        <Metrics {...metricsProps} />
        <Center w="full">
          <ProjectMap
            height={569}
            width={1240}
            projectId={project}
            setSelectedCityId={setSelectedCityId}
          />
        </Center>
        {selectedCityId}
      </Box>
      <HStack spaceX={4} mt={8} px={4}>
        <LinkCard
          title="GHGI"
          description="Detailed emissions inventory, with focus on transportation and urban infrastructure."
          link="https://citycatalyst.io/en/public/01170216-ab15-4fe0-a316-d09d84a80f8b"
          methodologyLink=""
        />
        <LinkCard
          title="CAP"
          description="Climate risk assessment, focusing on vulnerabilities and adaptations strategies."
          link="https://cap.openearth.dev/#/city/Caxias%20do%20Sul"
          methodologyLink=""
        />
        <LinkCard
          title="CCRA"
          description="Climate action plan focusing on urban resilience and nature-based solutions for a coastal city."
          link="https://citycatalyst-ccra.replit.app/cities/BR%20CXL"
          methodologyLink=""
        />
      </HStack>
      <Footer {...footerProps} />
    </VStack>
  );
}
