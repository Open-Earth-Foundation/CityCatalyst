"use client";

import { Box, Switch, Table, Tabs, Text } from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";

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
  onModuleToggle?: (
    projectId: string,
    moduleName: string,
    hasAccess: boolean,
  ) => void;
}

const ProjectModulesTabs = ({
  projects,
  modules,
  lng,
  onModuleToggle,
}: ProjectModulesTabsProps) => {
  const { t } = useTranslation(lng, "admin");

  if (!projects || projects.length === 0) {
    return null;
  }

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
                    {modules.map((module) => (
                      <Table.Row key={module.name} fontSize="body.md">
                        <Table.Cell>{module.name}</Table.Cell>
                        <Table.Cell>{module.provider}</Table.Cell>
                        <Table.Cell textAlign="end">
                          <Switch.Root
                            checked={module.hasAccess}
                            onCheckedChange={(checked) => {
                              onModuleToggle?.(
                                projectId,
                                module.name,
                                checked.checked,
                              );
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
        ))}
      </Tabs.Root>
    </Box>
  );
};

export default ProjectModulesTabs;
