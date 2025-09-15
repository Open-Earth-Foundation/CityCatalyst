"use client";

import { Box, Spinner, Table, Tabs, Text } from "@chakra-ui/react";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/i18n/client";
import { toaster } from "@/components/ui/toaster";
import {
  useGetModulesQuery,
  useGetProjectModulesQuery,
  useEnableProjectModuleAccessMutation,
  useDisableProjectModuleAccessMutation,
} from "@/services/api";
import { useState, useMemo } from "react";

interface Module {
  name: string;
  provider: string;
  hasAccess: boolean;
}

interface Project {
  projectId: string;
  name: string;
}

interface ProjectModulesTabsProps {
  projects: Project[];
  modules: Module[];
  lng: string;
}

const ProjectModulesTabs = ({
  projects,
  modules,
  lng,
}: ProjectModulesTabsProps) => {
  const { t } = useTranslation(lng, "admin");

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    projects[0]?.projectId || "",
  );

  // Fetch all modules
  const { data: allModules, isLoading: isAllModulesLoading } =
    useGetModulesQuery();

  // Fetch project modules for the selected project only
  const { data: selectedProjectModules, isLoading: isProjectModulesLoading } =
    useGetProjectModulesQuery(selectedProjectId, { skip: !selectedProjectId });

  // Memoized function to get modules with access for the selected project
  const modulesWithAccess = useMemo(() => {
    if (!allModules || !selectedProjectId) return [];

    const projectModuleIds = new Set(
      selectedProjectModules?.map((mod) => mod.id) || [],
    );

    return allModules.map((module) => ({
      ...module,
      hasAccess: projectModuleIds.has(module.id),
    }));
  }, [allModules, selectedProjectModules, selectedProjectId]);

  // Loading state
  const isLoading =
    isAllModulesLoading || (selectedProjectId && isProjectModulesLoading);

  if (!projects || projects.length === 0) {
    return null;
  }
  const [
    enableProjectModuleAccess,
    { isLoading: isEnableProjectModuleAccessLoading },
  ] = useEnableProjectModuleAccessMutation();

  // disable project module access
  const [
    disableProjectModuleAccess,
    { isLoading: isDisableProjectModuleAccessLoading },
  ] = useDisableProjectModuleAccessMutation();

  const handleModuleToggle = async (
    e: React.FormEvent<HTMLLabelElement>,
    projectId: string,
    moduleId: string,
  ) => {
    const isChecked = (e.target as HTMLInputElement).checked;
    const module = modulesWithAccess.find((m) => m.id === moduleId);
    const moduleName = module?.name?.en || "Module";

    try {
      if (isChecked) {
        await enableProjectModuleAccess({
          projectId: projectId,
          moduleId: moduleId,
        }).unwrap();

        toaster.success({
          title: t("module-access-enabled"),
          description: t("module-access-enabled-description", { moduleName }),
          duration: 3000,
        });
      } else {
        await disableProjectModuleAccess({
          projectId: projectId,
          moduleId: moduleId,
        }).unwrap();

        toaster.create({
          type: "info",
          title: t("module-access-disabled"),
          description: t("module-access-disabled-description", { moduleName }),
          duration: 3000,
        });
      }
    } catch (error) {
      console.error("Failed to toggle module access:", error);

      toaster.error({
        title: t("module-access-error"),
        description: t("module-access-error-description"),
        duration: 5000,
      });
    }
  };

  return (
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

          {/* Project Tab Triggers */}
          <Tabs.List gap="12px" border="none">
            {projects.map(({ projectId, name }) => (
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
                onClick={() => {
                  setSelectedProjectId(projectId);
                }}
              >
                {name}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Box>

        {/* Project Tab Content */}
        {projects.map(({ projectId, name }) => (
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
            {/* Project Header */}
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

            {/* Modules Table */}
            <Box w="full">
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
                      <Table.ColumnHeader>{t("provider")}</Table.ColumnHeader>
                      <Table.ColumnHeader textAlign="end">
                        {""}
                      </Table.ColumnHeader>
                    </Table.Row>
                  </Table.Header>

                  <Table.Body>
                    {projectId === selectedProjectId && (
                      <>
                        {isLoading ? (
                          <Table.Row>
                            <Table.Cell
                              colSpan={3}
                              textAlign="center"
                              py="32px"
                            >
                              <Box
                                display="flex"
                                alignItems="center"
                                justifyContent="center"
                                gap="12px"
                              >
                                {/* small spinner for micro loading states*/}
                                <Spinner size="sm" color="content.secondary" />
                                <Text
                                  color="content.secondary"
                                  fontSize="body.md"
                                >
                                  {t("laoding")}
                                </Text>
                              </Box>
                            </Table.Cell>
                          </Table.Row>
                        ) : (
                          modulesWithAccess.map((module) => (
                            <Table.Row key={module.id} fontSize="body.md">
                              <Table.Cell>{module.name.en}</Table.Cell>
                              <Table.Cell>{module.author}</Table.Cell>
                              <Table.Cell textAlign="end">
                                <Switch
                                  checked={module.hasAccess}
                                  onChange={(
                                    e: React.FormEvent<HTMLLabelElement>,
                                  ) => {
                                    // move to a function
                                    handleModuleToggle(e, projectId, module.id);
                                  }}
                                />
                              </Table.Cell>
                            </Table.Row>
                          ))
                        )}
                      </>
                    )}
                  </Table.Body>
                </Table.Root>
              </Table.ScrollArea>
            </Box>
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </Box>
  );
};

export default ProjectModulesTabs;
