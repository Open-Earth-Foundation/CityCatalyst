/* eslint-disable i18next/no-literal-string */
"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Box, Button, Card, Center, HStack, VStack } from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";
import { formatEmissions } from "@/util/helpers";
import type { ProjectBoundary } from "@/util/types";
import type {
  PublicProjectCity,
  PublicProjectShell,
  PublicProjectSummary,
} from "@/backend/PublicProjectService";
import Link from "next/link";
import { TitleLarge } from "@/components/package/Texts/Title";
import LabelLarge from "@/components/package/Texts/Label";
import Hero from "./Hero";
import PartnerLogos, { type PartnerLogo } from "./PartnerLogo";
import Metrics, { type MetricItem } from "./Metrics";
import Navbar from "./Navbar";
import Collaborators from "./Collaborators";
import Footer, { type FooterProps } from "./Footer";
import type { CityMetadata } from "../ProjectMap";

// pigeon-maps touches the DOM on import - keep it out of the SSR pass.
const ProjectMap = dynamic(() => import("../ProjectMap"), { ssr: false });

// Presentational shell for the public project landing page. Receives
// already-resolved, plain data from the server-rendered page - the only
// client-only concerns here are translation and the map's selectedCity
// interaction.
export interface ProjectPageShellProps {
  lng: string;
  project: string;
  organization: Extract<PublicProjectShell, { status: "ok" }>["organization"];
  cities: PublicProjectCity[];
  summary: PublicProjectSummary | null;
  boundaries: ProjectBoundary[];
  partners: PartnerLogo[];
  footerProps: FooterProps;
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
            style={{ textDecoration: "underline" }}
          >
            More about the methodology
          </Link>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

export function ProjectPageShell({
  lng,
  project,
  cities,
  summary,
  boundaries,
  partners,
  footerProps,
}: ProjectPageShellProps) {
  useTranslation(lng, "dashboard");
  const [selectedCity, setSelectedCity] = useState<CityMetadata | undefined>();

  const formattedEmissions = summary?.totalEmissions
    ? formatEmissions(summary.totalEmissions)
    : { value: "N/A", unit: "" };
  const totalEmissions =
    `${formattedEmissions.value} ${formattedEmissions.unit}`.trim();

  const metricsProps = {
    title: "Impact",
    description:
      "Real-time data from Brazilian cities participating in the CHAMP initiative",
    metrics: [
      {
        value: summary?.totalCities ?? cities.length ?? "N/A",
        label: "Cities",
      },
      {
        value: totalEmissions ?? "N/A",
        label: "Total Emissions",
      },
      {
        value: summary?.totalPopulation ?? "N/A",
        label: "Population",
      },
      {
        value: summary?.totalDataSources ?? "N/A",
        label: "Data Sources",
      },
    ] as MetricItem[],
  };

  return (
    <VStack minH="100vh" gap={0} flexDirection="column">
      <Navbar lng={lng} project={project} />
      <Box flex={1} flexGrow={1} w="100%">
        <Hero />
        <PartnerLogos partners={partners} />
      </Box>
      <Box borderRadius={8} p={4} m={8}>
        <Metrics {...metricsProps} />
        <Center w="full">
          <ProjectMap
            height={569}
            width={1240}
            boundaries={boundaries}
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

export default ProjectPageShell;
