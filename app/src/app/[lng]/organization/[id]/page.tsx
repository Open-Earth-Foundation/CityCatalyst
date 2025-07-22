"use client";
import { OrganizationHero } from "@/components/Organization/OrganizationHero";
import ProjectCard from "@/components/Organization/ProjectCard";
import ProgressLoader from "@/components/ProgressLoader";
import { BodyLarge, BodyMedium } from "@/components/Texts/Body";
import { ButtonMedium } from "@/components/Texts/Button";
import { HeadlineLarge, HeadlineSmall } from "@/components/Texts/Headline";
import { LabelLarge } from "@/components/Texts/Label";
import { useTranslation } from "@/i18n/client";
import { useGetOrganizationQuery, useGetProjectsQuery } from "@/services/api";
import { ProjectWithCities } from "@/util/types";
import { Card, Icon, SimpleGrid, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { use } from "react";
import { MdArrowForward } from "react-icons/md";

export default function OrganizationPage(props: {
  params: Promise<{ lng: string; id: string }>;
}) {
  const { lng, id } = use(props.params);
  const { t } = useTranslation(lng, "organization");

  const {
    data: organization,
    isLoading: orgLoading,
    error: orgError,
  } = useGetOrganizationQuery(id);

  const {
    data: projects,
    isLoading: projectsLoading,
    error: projectsError,
  } = useGetProjectsQuery({ organizationId: id });

  if (orgLoading || projectsLoading) {
    return (
      <VStack w="full" h="full" alignItems="center" justifyContent="center">
        <ProgressLoader />
      </VStack>
    );
  }

  if (orgError || projectsError || !organization) {
    return (
      <VStack w="full" h="full" alignItems="center" justifyContent="center">
        <BodyLarge color="danger">{t("error-loading-data")}</BodyLarge>
      </VStack>
    );
  }

  return (
    <VStack>
      <OrganizationHero t={t} organization={organization} />
      <VStack
        spaceY="56px"
        p="56px"
        h="full"
        w="full"
        bg="background.backgroundLight"
        alignItems="start"
        justifyContent="start"
      >
        <VStack spaceY="24px" alignItems="start" justifyContent="start">
          <HeadlineLarge>{t("all-projects")}</HeadlineLarge>
          <BodyLarge>{t("explore-projects-description")}</BodyLarge>
        </VStack>
        <SimpleGrid minChildWidth="xs" gap="24px" w="full">
          {projects && projects.length > 0 ? (
            projects.map((project: ProjectWithCities) => (
              <ProjectCard t={t} project={project} key={project.projectId} />
            ))
          ) : (
            <BodyMedium>{t("no-projects-found")}</BodyMedium>
          )}
        </SimpleGrid>
        <NextLink
          href="https://citycatalyst.openearth.org"
          target="_blank"
          rel="noopener noreferrer"
          style={{ width: "100%" }}
        >
          <Card.Root w="full">
            <Card.Header>
              <LabelLarge>{t("learning")}</LabelLarge>
              <HeadlineSmall color="content.link">
                {t("learn-more-blog")}
              </HeadlineSmall>
            </Card.Header>
            <Card.Body>{t("read-blog-description")}</Card.Body>
            <Card.Footer justifyContent="right">
              <ButtonMedium color="content.link" textTransform="uppercase">
                {t("visit-blog")}
              </ButtonMedium>
              <Icon as={MdArrowForward} color="content.link" />
            </Card.Footer>
          </Card.Root>
        </NextLink>
      </VStack>
    </VStack>
  );
}
