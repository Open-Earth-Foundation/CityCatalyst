"use client";
import {
  Box,
  Button,
  Heading,
  Icon,
  IconButton,
  Table,
  Tabs,
  TabsList,
  Text,
} from "@chakra-ui/react";
import { MdAdd, MdMoreVert } from "react-icons/md";
import React, { useMemo, useState, use } from "react";
import { useTranslation } from "@/i18n/client";
import { useGetOrganizationQuery, useGetProjectsQuery } from "@/services/api";
import {
  ProgressCircleRing,
  ProgressCircleRoot,
} from "@/components/ui/progress-circle";
import DataTable from "@/components/ui/data-table";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import CreateEditProjectModal from "@/app/[lng]/admin/organization/[id]/projects/CreateEditProjectModal";
import { RiDeleteBin6Line, RiEditLine } from "react-icons/ri";
import DeleteProjectModal from "@/app/[lng]/admin/organization/[id]/projects/DeleteProjectModal";
import ProgressLoader from "@/components/ProgressLoader";

const AdminOrganizationProjectsPage = (props: {
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

  console.log(organization);
  // all projects mock data
  console.log(projects);
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
          <Text
            fontFamily="heading"
            fontSize="title.md"
            fontWeight="semibold"
            color="content.secondary"
            mb="12px"
          >
            {t("projects")}
          </Text>
          <Tabs.Root defaultValue="projects" orientation="vertical">
            <Tabs.List>
              <Tabs.Trigger value="projects">tab</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="projects">
              <Box>
                <Text>{t("projects")}</Text>
              </Box>
            </Tabs.Content>
          </Tabs.Root>
        </Box>
      )}
      <CreateEditProjectModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setProjectToEdit(null);
        }}
        t={t}
        onOpenChange={setIsModalOpen}
        organizationId={id}
        projectData={projectToEdit}
      />
      <DeleteProjectModal
        projectId={projectToEdit?.projectId as string}
        projectName={projectToEdit?.projectName as string}
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setProjectToEdit(null);
        }}
        t={t}
        onOpenChange={setIsDeleteModalOpen}
      />
    </Box>
  );
};

export default AdminOrganizationProjectsPage;
