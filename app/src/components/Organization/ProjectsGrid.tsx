"use client";
import ProjectCard from "@/components/Organization/ProjectCard";
import { BodyMedium } from "@/components/package/Texts/Body";
import { ProjectWithCities } from "@/util/types";
import { SimpleGrid } from "@chakra-ui/react";
import type { TFunction } from "i18next";

interface ProjectsGridProps {
  t: TFunction;
  lng: string;
  projects: ProjectWithCities[];
}

export default function ProjectsGrid({ t, lng, projects }: ProjectsGridProps) {
  return (
    <SimpleGrid columns={{ base: 1, lg: 3 }} gap="24px" w="full">
      {projects.length > 0 ? (
        projects.map((project) => (
          <ProjectCard
            t={t}
            project={project}
            key={project.projectId}
            lng={lng}
            organizationId={project.organizationId}
          />
        ))
      ) : (
        <BodyMedium>{t("no-projects-found")}</BodyMedium>
      )}
    </SimpleGrid>
  );
}
