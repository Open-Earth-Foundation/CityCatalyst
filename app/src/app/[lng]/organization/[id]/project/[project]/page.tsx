"use client";
import { OrganizationHero } from "@/components/Organization/OrganizationHero";
import ProgressLoader from "@/components/ProgressLoader";
import { BodyLarge } from "@/components/package/Texts/Body";
import { ButtonMedium } from "@/components/package/Texts/Button";
import { HeadlineLarge, HeadlineSmall } from "@/components/package/Texts/Headline";
import { LabelLarge } from "@/components/package/Texts/Label";
import DataTable from "@/components/ui/data-table";
import { useTranslation } from "@/i18n/client";
import { useGetOrganizationQuery, useGetProjectsQuery } from "@/services/api";
import { ProjectWithCities } from "@/util/types";
import { Box, Button, Card, Icon, Table, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { MdArrowBack, MdArrowForward, MdNavigateNext } from "react-icons/md";

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

  const [project, setProject] = useState<ProjectWithCities | null>(null);
  useEffect(() => {
    if (projects && projectId) {
      const foundProject = projects.find(
        (proj) => proj.projectId === projectId,
      );
      setProject(foundProject || null);
    }
  }, [projectId, projects]);

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
              <DataTable
                data={project?.cities}
                searchable
                pagination
                itemsPerPage={20}
                columns={[
                  { header: t("city-name"), accessor: "name" },
                  {
                    header: t("country-name"),
                    accessor: "country",
                  },
                  { header: t("status"), accessor: null },
                  { header: "", accessor: null },
                ]}
                selectKey="cityId"
                renderRow={(item, idx) => (
                  <Table.Row key={idx}>
                    <Table.Cell>{item.name}</Table.Cell>
                    <Table.Cell>{item.country}</Table.Cell>
                    <Table.Cell>{t("active")}</Table.Cell>
                    <Table.Cell textAlign="end">
                      <Icon
                        as={MdNavigateNext}
                        boxSize={6}
                        color="interactive.control"
                      />
                    </Table.Cell>
                  </Table.Row>
                )}
              />
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
