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
import { MdAdd, MdMoreVert } from "react-icons/md";
import React, { useMemo, useState } from "react";
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

const AdminOrganizationProjectsPage = ({
  params: { lng, id },
}: {
  params: { lng: string; id: string };
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<{
    projectName: string;
    description: string;
    cityCountLimit: number;
    projectId: string;
  } | null>(null);

  const { t } = useTranslation(lng, "admin");

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
    return (
        <ProgressLoader/>
    );
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
          <div className="flex items-center justify-center w-full">
            <Box className="w-full py-12 flex items-center justify-center">
              <ProgressCircleRoot value={null}>
                <ProgressCircleRing cap="round" />
              </ProgressCircleRoot>
            </Box>
          </div>
        )}
        {!isProjectDataLoading && projects?.length === 0 && (
          <Text color="content.tertiary" fontSize="body.lg">
            {t("no-data")}
          </Text>
        )}
      </Box>

      {!isProjectDataLoading && projects && projects.length > 0 && (
        <DataTable
          t={t}
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
              <Table.Cell className="truncate" maxW="200px">
                {item.admin}
              </Table.Cell>
              <Table.Cell
                className="truncate"
                maxW="200px"
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
                        className="group-hover:text-white"
                        color="interactive.control"
                        as={RiEditLine}
                        h="24px"
                        w="24px"
                      />
                      <Text
                        className="group-hover:text-white"
                        color="content.primary"
                      >
                        {t("edit-project")}
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
                        className="group-hover:text-white"
                        color="sentiment.negativeDefault"
                        as={RiDeleteBin6Line}
                        h="24px"
                        w="24px"
                      />
                      <Text
                        className="group-hover:text-white"
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
