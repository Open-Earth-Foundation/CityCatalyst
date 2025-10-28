"use client";
import { OrganizationHero } from "@/components/Organization/OrganizationHero";
import ProgressLoader from "@/components/ProgressLoader";
import { BodyLarge } from "@/components/package/Texts/Body";
import { ButtonMedium, ButtonSmall } from "@/components/package/Texts/Button";
import {
  HeadlineLarge,
  HeadlineSmall,
} from "@/components/package/Texts/Headline";
import { LabelLarge } from "@/components/package/Texts/Label";
import { lazy, Suspense } from "react";

const CitiesTable = lazy(() => import("@/components/Project/CitiesTable"));
import { useTranslation } from "@/i18n/client";
import { useGetOrganizationQuery, useGetProjectsQuery } from "@/services/api";
import { Box, Card, Icon, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { use, useMemo } from "react";
import { MdArrowBack, MdArrowForward, MdNavigateNext } from "react-icons/md";
import { Button } from "@/components/ui/button";

export default function ProjectPage(props: {
  params: Promise<{ lng: string; id: string; project: string }>;
}) {
  const { lng, id: organizationId, project: projectId } = use(props.params);
  const { t } = useTranslation(lng, "organization");
  const router = useRouter();

  const {
    data: organization,
    isLoading: orgLoading,
    error: orgError,
  } = useGetOrganizationQuery(organizationId);

  const {
    data: projects,
    isLoading: areProjectsLoading,
    error: projectsError,
  } = useGetProjectsQuery({ organizationId });

  const project = useMemo(() => {
    if (!projects || !projectId) return null;
    return projects.find((proj) => proj.projectId === projectId) || null;
  }, [projects, projectId]);

  if (orgLoading || areProjectsLoading) {
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
      >
        <Box mx="auto" maxW="980px" w="full" py="56px">
          <VStack
            spaceY="56px"
            alignItems="start"
            justifyContent="start"
            w="full"
          >
            <VStack spaceY="24px" alignItems="start" justifyContent="start">
              <Button
                variant="ghost"
                alignSelf="flex-start"
                color="content.primary"
                onClick={() =>
                  router.push(`/${lng}/organization/${organizationId}/project/`)
                }
                textTransform="unset"
              >
                <Icon as={MdArrowBack} boxSize={4} />
                {t("all-projects")}
              </Button>
              <HeadlineLarge>
                {project?.name === "cc_project_default"
                  ? t("default-project")
                  : project?.name}
              </HeadlineLarge>
              <BodyLarge>{t("discover-cities-description")}</BodyLarge>
            </VStack>
            {project?.cities && project.cities.length > 0 && (
              <Suspense fallback={<ProgressLoader />}>
                <CitiesTable cities={project.cities} lng={lng} t={t} />
              </Suspense>
            )}
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
