"use client";
import { OrganizationHero } from "@/components/Organization/OrganizationHero";
import ProjectsGrid from "@/components/Organization/ProjectsGrid";
import ProgressLoader from "@/components/ProgressLoader";
import { BodyLarge } from "@/components/package/Texts/Body";
import { ButtonMedium } from "@/components/package/Texts/Button";
import { HeadlineLarge, HeadlineSmall } from "@/components/package/Texts/Headline";
import { LabelLarge } from "@/components/package/Texts/Label";
import { useTranslation } from "@/i18n/client";
import { useGetOrganizationQuery, useGetProjectsQuery } from "@/services/api";
import { Box, Card, Icon, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { use } from "react";
import { MdArrowForward } from "react-icons/md";

export default function OrganizationPage(props: {
  params: Promise<{ lng: string; id: string }>;
}) {
  const { lng, id: organizationId } = use(props.params);
  const { t } = useTranslation(lng, "organization");

  const {
    data: organization,
    isLoading: orgLoading,
    error: orgError,
  } = useGetOrganizationQuery(organizationId);

  const {
    data: projects,
    isLoading: projectsLoading,
    error: projectsError,
  } = useGetProjectsQuery({ organizationId });

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
      <OrganizationHero t={t} organization={organization} projects={projects} />
      <VStack
        h="full"
        w="full"
        bg="background.backgroundLight"
        alignItems="start"
        justifyContent="start"
        id="projects-container"
      >
        <Box mx="auto" maxW="980px" w="full" py="56px">
          <VStack spaceY="56px" alignItems="start" justifyContent="start" w="full">
            <VStack spaceY="24px" alignItems="start" justifyContent="start">
              <HeadlineLarge>{t("all-projects")}</HeadlineLarge>
              <BodyLarge>{t("explore-projects-description")}</BodyLarge>
            </VStack>
            <ProjectsGrid t={t} lng={lng} projects={projects ?? []} />
            <NextLink
              href="https://citycatalyst.openearth.org/learning-hub"
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
        </Box>
      </VStack>
    </VStack>
  );
}
