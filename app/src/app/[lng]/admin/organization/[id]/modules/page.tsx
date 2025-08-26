"use client";
import { Box, Heading, Text } from "@chakra-ui/react";

import { use } from "react";
import { useTranslation } from "@/i18n/client";
import { useGetOrganizationQuery, useGetProjectsQuery } from "@/services/api";

import ProgressLoader from "@/components/ProgressLoader";
import ProjectModulesTabs from "@/components/admin/ProjectModulesTabs";

const AdminOrganizationModulesPage = (props: {
  params: Promise<{ lng: string; id: string }>;
}) => {
  const { lng, id } = use(props.params);
  const { t } = useTranslation(lng, "admin");

  const { data: organization, isLoading: isOrganizationLoading } =
    useGetOrganizationQuery(id);

  const { data: projects, isLoading: isProjectDataLoading } =
    useGetProjectsQuery({
      organizationId: id,
    });

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

  const handleModuleToggle = (
    projectId: string,
    moduleName: string,
    hasAccess: boolean,
  ) => {
    // TODO: implement module access update logic
    console.log(
      `Toggle ${moduleName} for project ${projectId} to ${hasAccess}`,
    );
  };
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
              <ProgressLoader />
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
        <ProjectModulesTabs
          projects={projects}
          modules={modules}
          lng={lng}
          onModuleToggle={handleModuleToggle}
        />
      )}
    </Box>
  );
};

export default AdminOrganizationModulesPage;
