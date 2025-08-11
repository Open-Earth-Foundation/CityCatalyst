"use client";
import { BodyMedium } from "@/components/Texts/Body";
import { HeadlineSmall } from "@/components/Texts/Headline";
import { ProjectWithCities } from "@/util/types";
import { Card, HStack, Icon } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { MdLocationCity, MdPersonOutline } from "react-icons/md";

interface ProjectCardProps {
  t: TFunction;
  project: ProjectWithCities;
}

export default function ProjectCard({ project, t }: ProjectCardProps) {
  return (
    <Card.Root shadow="2dp" borderRadius="8px">
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
          <Icon
            as={MdLocationCity}
            boxSize="24px"
            color="interactive.control"
          />
          <BodyMedium>{project.cities.length}</BodyMedium>
          <Icon
            as={MdPersonOutline}
            boxSize="24px"
            color="interactive.control"
          />
          <BodyMedium>{project.cities.length}</BodyMedium>
        </HStack>
      </Card.Footer>
    </Card.Root>
  );
}
