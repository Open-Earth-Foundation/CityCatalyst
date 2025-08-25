"use client";
import { Box, Heading, Switch, Table, Tabs, Text } from "@chakra-ui/react";

import React, { useMemo, useState, use } from "react";
import { useTranslation } from "@/i18n/client";
import { useGetOrganizationQuery, useGetProjectsQuery } from "@/services/api";
import {
  ProgressCircleRing,
  ProgressCircleRoot,
} from "@/components/ui/progress-circle";

import ProgressLoader from "@/components/ProgressLoader";

const AdminOrganizationModulesPage = (props: {
  params: Promise<{ lng: string; id: string }>;
}) => {
  const { lng, id } = use(props.params);
  const { t } = useTranslation(lng, "admin");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<{
    projectName: string;
    description: string;
    cityCountLimit: number;
    projectId: string;
  } | null>(null);

  const { data: organization, isLoading: isOrganizationLoading } =
    useGetOrganizationQuery(id);

  const { data: projects, isLoading: isProjectDataLoading } =
    useGetProjectsQuery({
      organizationId: id,
    });

  const transformedProjects = useMemo(() => {
    if (!projects) return [];
    return projects.map((project) => {
      const totalCityCount = project.cities.length;
      return {
        name: project.name,
        cities: `${totalCityCount}/${project.cityCountLimit}`,
        description: project.description,
        admin: "N/A",
        cityCountLimit: project.cityCountLimit as number,
        projectId: project.projectId,
      };
    });
  }, [projects]);

  if (isOrganizationLoading) {
    return <ProgressLoader />;
  }

  //  TODO: get modules from backend

  const modules = [
    {
      name: t("ghg-inventories"),
      provider: "Open Earth Foundation",
      hasAccess: true,
    },
    {
      name: t("climate-risks"),
      provider: "Open Earth Foundation",
      hasAccess: true,
    },
    {
      name: t("actions-and-plans"),
      provider: "Open Earth Foundation",
      hasAccess: false,
    },
    {
      name: t("finance-readiness"),
      provider: "Open Earth Foundation",
      hasAccess: false,
    },
  ];
  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Box>
          <Heading
            fontSize="headline.sm"
            mb={2}
            fontWeight="semibold"
            lineHeight="32px"
            fontStyle="normal"
            textTransform="capitalize"
            color="content.secondary"
          >
            {t("org-modules-heading", { name: organization?.name })}
          </Heading>
          <Text color="content.tertiary" fontSize="body.lg">
            {t("control-panel-for-organization", { name: organization?.name })}
          </Text>
        </Box>
      </Box>
      <Box>
        {isProjectDataLoading && (
          <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            w="full"
          >
            <Box
              display="flex"
              justifyContent="center"
              alignItems="center"
              w="full"
            >
              <ProgressCircleRoot value={null}>
                <ProgressCircleRing cap="round" />
              </ProgressCircleRoot>
            </Box>
          </Box>
        )}
        {!isProjectDataLoading && projects?.length === 0 && (
          <Text color="content.tertiary" fontSize="body.lg">
            {t("no-data")}
          </Text>
        )}
      </Box>

      {!isProjectDataLoading && projects && projects.length > 0 && (
        // vertical tabs
        <Box py="48px">
          <Tabs.Root
            defaultValue={projects[0].projectId}
            orientation="vertical"
            variant="plain"
          >
            <Box display="flex" flexDirection="column" gap="12px">
              <Text
                fontFamily="heading"
                fontSize="title.md"
                fontWeight="semibold"
                color="content.secondary"
              >
                {t("projects")}
              </Text>
              {/* Render project tabs */}
              <Tabs.List gap="12px" border="none">
                {projects.map(({ projectId, name }) => {
                  return (
                    <Tabs.Trigger
                      value={projectId}
                      key={projectId}
                      w="223px"
                      fontFamily="heading"
                      fontSize="label.lg"
                      fontWeight="bold"
                      p="16px"
                      _selected={{
                        color: "content.link",
                        borderRadius: "8px",
                      }}
                    >
                      {name}
                    </Tabs.Trigger>
                  );
                })}
              </Tabs.List>
            </Box>
            {/* Render project content */}
            {projects.map(({ projectId, name }) => {
              return (
                <Tabs.Content
                  value={projectId}
                  key={projectId}
                  ml="36px"
                  p="24px"
                  gap="24px"
                  display="flex"
                  flexDirection="column"
                  w="full"
                >
                  <Box display="flex" alignItems="center" gap="8px">
                    <Text
                      fontFamily="heading"
                      color="content.secondary"
                      fontSize="title.md"
                      fontWeight="semibold"
                    >
                      {name}
                    </Text>
                    <Text
                      fontFamily="heading"
                      color="content.secondary"
                      fontSize="title.md"
                      fontWeight="semibold"
                    >
                      |
                    </Text>
                    <Text
                      fontFamily="heading"
                      color="content.secondary"
                      fontSize="title.md"
                      fontWeight="semibold"
                    >
                      {t("active-modules")}
                    </Text>
                  </Box>

                  <Box w="full">
                    {/* Access table */}
                    <Table.ScrollArea
                      w="full"
                      borderWidth="1px"
                      borderColor="border.overlay"
                      rounded="lg"
                    >
                      <Table.Root size="lg">
                        <Table.Header>
                          <Table.Row
                            bg="bg.subtle"
                            textTransform="uppercase"
                            fontFamily="heading"
                            color="content.secondary"
                            fontSize="button.sm"
                            fontWeight="bold"
                            letterSpacing="widest"
                          >
                            <Table.ColumnHeader>
                              {t("module-name")}
                            </Table.ColumnHeader>
                            <Table.ColumnHeader>
                              {t("provider")}
                            </Table.ColumnHeader>
                            <Table.ColumnHeader textAlign="end">
                              {""}
                            </Table.ColumnHeader>
                          </Table.Row>
                        </Table.Header>

                        <Table.Body>
                          {modules.map((item) => (
                            <Table.Row key={item.name} fontSize="body.md">
                              <Table.Cell>{item.name}</Table.Cell>
                              <Table.Cell>{item.provider}</Table.Cell>
                              <Table.Cell textAlign="end">
                                <Switch.Root
                                  checked={item.hasAccess}
                                  onCheckedChange={() => {
                                    // TODO: update module access logic
                                  }}
                                >
                                  <Switch.HiddenInput />
                                  <Switch.Control borderRadius="16px" />
                                  <Switch.Label />
                                </Switch.Root>
                              </Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table.Root>
                    </Table.ScrollArea>
                  </Box>
                </Tabs.Content>
              );
            })}
          </Tabs.Root>
        </Box>
      )}
    </Box>
  );
};

export default AdminOrganizationModulesPage;
