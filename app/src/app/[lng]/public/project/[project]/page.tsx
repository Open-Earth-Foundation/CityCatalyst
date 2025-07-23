/* eslint-disable i18next/no-literal-string */
"use client";

import { useState, use } from "react";
import { api } from "@/services/api";
import type { CityMetadata } from "./ProjectMap";
import ProjectMap from "./ProjectMap";
import { Box, Button, Card, Center, HStack, VStack } from "@chakra-ui/react";
import Footer from "./components/Footer";
import Link from "next/link";
import { TitleLarge } from "@/components/Texts/Title";
import LabelLarge from "@/components/Texts/Label";
import Hero from "@/app/[lng]/public/project/[project]/components/Hero";
import PartnerLogos from "@/app/[lng]/public/project/[project]/components/PartnerLogo";
import Metrics from "@/app/[lng]/public/project/[project]/components/Metrics";
import Navbar from "@/app/[lng]/public/project/[project]/components/Navbar";
import Collaborators from "@/app/[lng]/public/project/[project]/components/Collaborators";
import { formatEmissions } from "@/util/helpers";
import { useTranslation } from "@/i18n/client";

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
    logo: "/assets/projects_dashboard/global_covenant_logo.png",
  },
  {
    id: "5",
    name: "Icare",
    logo: "/assets/projects_dashboard/icare_logo.png",
  },
  {
    id: "6",
    name: "Openearth",
    logo: "/assets/projects_dashboard/openearth.png",
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
  disabled,
}: {
  title: string;
  description: string;
  link: string;
  methodologyLink: string;
  disabled?: boolean;
}) {
  return (
    <Card.Root rounded={8}>
      <Card.Body borderRadius={8}>
        <VStack spaceY={4} alignItems="left">
          <TitleLarge color="interactive.secondary">{title}</TitleLarge>
          <LabelLarge>{description}</LabelLarge>
          <Link href={link} target="_blank" rel="noopener noreferrer">
            <Button w="full" disabled={disabled}>
              SEE RESULTS
            </Button>
          </Link>
          <Link
            href={methodologyLink}
            target="_blank"
            rel="noopener noreferrer"
            color="interactive.secondary"
            className="underline"
          >
            More about the methodology
          </Link>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

export default function ProjectPage(props: {
  params: Promise<{ project: string; lng: string }>;
}) {
  const { lng, project } = use(props.params);
  const { t } = useTranslation(lng, "dashboard");

  const {
    data: projectSummary,
    isLoading,
    error,
  } = api.useGetProjectSummaryQuery(project!, {
    skip: !project,
  });
  const [selectedCity, setSelectedCity] = useState<CityMetadata | undefined>();

  const formattedEmissions = projectSummary?.totalEmissions
    ? formatEmissions(projectSummary?.totalEmissions)
    : { value: "N/A", unit: "" };
  const totalEmissions = `${formattedEmissions.value} ${formattedEmissions.unit}CO2e`;

  // Metrics section content
  const metricsProps = {
    title: "Impact",
    description:
      "Real-time data from Brazilian cities participating in the CHAMP initiative",
    metrics: [
      {
        value: projectSummary?.totalCities ?? "N/A",
        label: "Cities",
      },
      {
        value: totalEmissions ?? "N/A",
        label: "Total Emissions",
      },
      {
        value: projectSummary?.totalPopulation ?? "N/A",
        label: "Population",
      },
      {
        value: projectSummary?.totalDataSources ?? "N/A",
        label: "Data Sources",
      },
    ] as MetricItem[],
  };

  return (
    <VStack className="min-h-screen" gap={0} flexDirection="column">
      <Navbar lng={lng} project={project} t={t} />
      <Box flex={1} className="flex-grow" w="100%">
        <Hero />
        <PartnerLogos partners={partners} />
      </Box>
      <Box borderRadius={8} p={4} m={8}>
        <Metrics {...metricsProps} />
        <Center w="full">
          <ProjectMap
            height={569}
            width={1240}
            projectId={project}
            setSelectedCity={setSelectedCity}
            selectedCity={selectedCity}
          />
        </Center>
        <TitleLarge my={4}>{selectedCity?.name}</TitleLarge>
        <HStack spaceX={4}>
          <LinkCard
            title="GHGI"
            description="Detailed emissions inventory, with focus on transportation and urban infrastructure."
            disabled={!selectedCity}
            link={`https://citycatalyst.io/en/public/${selectedCity?.latestInventoryId}`}
            methodologyLink=""
          />
          <LinkCard
            title="HIAP"
            description="Climate risk assessment, focusing on vulnerabilities and adaptations strategies."
            link={`https://cap.openearth.dev/#/city/${selectedCity?.name}`}
            disabled={!selectedCity}
            methodologyLink=""
          />
          <LinkCard
            title="CCRA"
            description="Climate action plan focusing on urban resilience and nature-based solutions for a coastal city."
            link={`https://citycatalyst-ccra.replit.app/cities/${selectedCity?.locode}`}
            disabled={!selectedCity}
            methodologyLink=""
          />
        </HStack>
      </Box>
      <Collaborators lng={lng} project={project} />
      <Footer {...footerProps} />
    </VStack>
  );
}
