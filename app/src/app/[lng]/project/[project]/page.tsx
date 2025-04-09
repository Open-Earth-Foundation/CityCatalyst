"use client";

import { useState } from "react";
import { api } from "@/services/api";
import ProjectMap from "./ProjectMap";
import NavigationBar from "./components/Navbar";
import { Box, Heading, HStack, Center, Link } from "@chakra-ui/react";
import Footer from "./components/Footer";
import Hero from "@/app/[lng]/project/[project]/components/Hero";
import PartnerLogos from "@/app/[lng]/project/[project]/components/PartnerLogo";
import Metrics from "@/app/[lng]/project/[project]/components/Metrics";

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
    <HStack className="min-h-screen" gap={0} flexDirection="column">
      <NavigationBar lng={lng} project={project} />
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
        {JSON.stringify(projectSummary)}
        {selectedCityId}
      </Box>
      <Footer {...footerProps} />
    </HStack>
  );
}
