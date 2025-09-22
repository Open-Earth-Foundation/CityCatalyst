"use client";
import {
  Box,
  Button,
  Heading,
  Icon,
  IconButton,
  Table,
  Text,
} from "@chakra-ui/react";
import { MdAdd, MdMoreVert, MdPublic } from "react-icons/md";
import React, { useMemo, useState, use } from "react";
import { useTranslation } from "@/i18n/client";
import { useGetOrganizationQuery, useGetProjectsQuery, useMarkCitiesPublicMutation } from "@/services/api";
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
import { UseSuccessToast, UseErrorToast } from "@/hooks/Toasts";
import { toaster } from "@/components/ui/toaster";

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

  const [markCitiesPublic] = useMarkCitiesPublicMutation();

  const { showSuccessToast } = UseSuccessToast({
    title: t("publish-project-success"),
  });

  const { showErrorToast } = UseErrorToast({
    title: t("publish-project-error"),
  });

  const handlePublishProject = async (projectId: string) => {
    toaster.loading({
      title: t("publishing-project"),
      type: "info",
    });
    
    try {
      await markCitiesPublic({ projectId }).unwrap();
      toaster.dismiss();
      showSuccessToast();
    } catch (error) {
      toaster.dismiss();
      console.error("Error publishing project:", error);
      showErrorToast();
    }
  };

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
            {t("org-project-heading", { name: organization?.name })}
          </Heading>
          <Text color="content.tertiary" fontSize="body.lg">
            {t("org-project-caption", { name: organization?.name })}
          </Text>
        </Box>
        <Button
          onClick={() => {
            setProjectToEdit(null);
            setIsModalOpen(true);
          }}
          h="48px"
          mt="auto"
        >
          <Icon as={MdAdd} h={8} w={8} />
          {t("add-project")}
        </Button>
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
        <DataTable
          searchable={true}
          pagination={true}
          data={[...transformedProjects].reverse()}
          title={t("projects")}
          columns={[
            {
              header: t("project-name"),
              accessor: "name",
            },
            { header: t("cities"), accessor: "cities" },
            { header: t("admin"), accessor: "admin" },
            { header: t("description"), accessor: "description" },
            { header: "", accessor: null },
          ]}
          renderRow={(item, idx) => (
            <Table.Row key={idx}>
              <Table.Cell>{item.name}</Table.Cell>
              <Table.Cell>{item.cities}</Table.Cell>
              <Table.Cell
                maxW="200px"
                textOverflow="ellipsis"
                overflow="hidden"
                whiteSpace="nowrap"
                truncate
              >
                {item.admin}
              </Table.Cell>
              <Table.Cell
                maxW="200px"
                textOverflow="ellipsis"
                overflow="hidden"
                whiteSpace="nowrap"
                truncate
                title={item.description}
              >
                {item.description}
              </Table.Cell>
              <Table.Cell>
                <MenuRoot>
                  <MenuTrigger>
                    <IconButton
                      data-testid="activity-more-icon"
                      aria-label="more-icon"
                      variant="ghost"
                      color="content.tertiary"
                    >
                      <Icon as={MdMoreVert} size="lg" />
                    </IconButton>
                  </MenuTrigger>
                  <MenuContent w="auto" borderRadius="8px" shadow="2dp" px="0">
                    <MenuItem
                      value={t("edit-project")}
                      valueText={t("edit-project")}
                      p="16px"
                      display="flex"
                      alignItems="center"
                      gap="16px"
                      _hover={{
                        bg: "content.link",
                        cursor: "pointer",
                      }}
                      className="group"
                      onClick={() => {
                        setProjectToEdit({
                          projectName: item.name,
                          description: item.description as string,
                          cityCountLimit: item.cityCountLimit,
                          projectId: item.projectId,
                        });
                        setIsModalOpen(true);
                      }}
                    >
                      <Icon
                        _groupHover={{
                          color: "white",
                        }}
                        color="interactive.control"
                        as={RiEditLine}
                        h="24px"
                        w="24px"
                      />
                      <Text
                        _groupHover={{
                          color: "white",
                        }}
                        color="content.primary"
                      >
                        {t("edit-project")}
                      </Text>
                    </MenuItem>
                    <MenuItem
                      value={t("publish-project")}
                      valueText={t("publish-project")}
                      p="16px"
                      display="flex"
                      alignItems="center"
                      gap="16px"
                      _hover={{
                        bg: "content.link",
                        cursor: "pointer",
                      }}
                      className="group"
                      onClick={() => handlePublishProject(item.projectId)}
                    >
                      <Icon
                        _groupHover={{
                          color: "white",
                        }}
                        color="interactive.control"
                        as={MdPublic}
                        h="24px"
                        w="24px"
                      />
                      <Text
                        _groupHover={{
                          color: "white",
                        }}
                        color="content.primary"
                      >
                        {t("publish-project")}
                      </Text>
                    </MenuItem>
                    <MenuItem
                      value={t("delete-project")}
                      valueText={t("delete-project")}
                      p="16px"
                      display="flex"
                      alignItems="center"
                      gap="16px"
                      _hover={{
                        bg: "content.link",
                        cursor: "pointer",
                      }}
                      className="group"
                      onClick={() => {
                        setProjectToEdit({
                          projectName: item.name,
                          description: item.description as string,
                          cityCountLimit: item.cityCountLimit,
                          projectId: item.projectId,
                        });
                        setIsDeleteModalOpen(true);
                      }}
                    >
                      <Icon
                        _groupHover={{
                          color: "white",
                        }}
                        color="sentiment.negativeDefault"
                        as={RiDeleteBin6Line}
                        h="24px"
                        w="24px"
                      />
                      <Text
                        _groupHover={{
                          color: "white",
                        }}
                        color="content.primary"
                      >
                        {t("remove")}
                      </Text>
                    </MenuItem>
                  </MenuContent>
                </MenuRoot>
              </Table.Cell>
            </Table.Row>
          )}
        />
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
