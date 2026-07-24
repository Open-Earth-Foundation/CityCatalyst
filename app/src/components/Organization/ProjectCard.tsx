"use client";
import { Tooltip } from "@/components/ui/tooltip";
import { GlobeLocationPinIcon } from "@/components/icons";
import { BodyMedium } from "@/components/package/Texts/Body";
import { HeadlineSmall } from "@/components/package/Texts/Headline";
import { ProjectWithCities } from "@/util/types";
import { Card, HStack, Icon } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import Link from "next/link";
import { MdLocationCity, MdPersonOutline, MdPublic } from "react-icons/md";

interface ProjectCardProps {
  t: TFunction;
  project: ProjectWithCities;
  organizationId?: string;
  lng: string;
}

export default function ProjectCard({
  project,
  t,
  organizationId,
  lng,
}: ProjectCardProps) {
  const projectPath = `/${lng}/organization/${organizationId}/project/${project.projectId}`;

  const totalCountries = new Set(
    project.cities.map((city) => city.countryLocode),
  ).size;
  const totalStates = new Set(
    project.cities
      .map((city) => city.regionLocode)
      .filter((regionLocode): regionLocode is string => !!regionLocode),
  ).size;

  return (
    <Link href={projectPath}>
      <Card.Root
        _hover={{ shadow: "2dp" }}
        transition="box-shadow 0.2s ease-in-out"
        borderRadius="8px"
      >
        <Card.Header>
          <HeadlineSmall>
            {project.name === "cc_project_default"
              ? t("default-project")
              : project.name}
          </HeadlineSmall>
        </Card.Header>
        <Card.Body>{project.description}</Card.Body>
        <Card.Footer>
          <HStack>
            <Tooltip
              content={t("countries-tooltip-label")}
              positioning={{ placement: "bottom" }}
              showArrow
            >
              <Icon as={MdPublic} boxSize="24px" color="interactive.control" />
            </Tooltip>
            <BodyMedium>{totalCountries}</BodyMedium>
            <Tooltip
              content={t("states-provinces-tooltip-label")}
              positioning={{ placement: "bottom" }}
              showArrow
            >
              <GlobeLocationPinIcon
                boxSize="24px"
                color="interactive.control"
              />
            </Tooltip>
            <BodyMedium>{totalStates}</BodyMedium>
            <Tooltip
              content={t("cities-tooltip-label")}
              positioning={{ placement: "bottom" }}
              showArrow
            >
              <Icon
                as={MdLocationCity}
                boxSize="24px"
                color="interactive.control"
              />
            </Tooltip>
            <BodyMedium>{project.cities.length}</BodyMedium>
            <Tooltip
              content={t("collaborators-tooltip-label")}
              positioning={{ placement: "bottom" }}
              showArrow
            >
              <Icon
                as={MdPersonOutline}
                boxSize="24px"
                color="interactive.control"
              />
            </Tooltip>
            <BodyMedium>{project.cities.length}</BodyMedium>
          </HStack>
        </Card.Footer>
      </Card.Root>
    </Link>
  );
}
