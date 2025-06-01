import { useTranslation } from "@/i18n/client";
import { Box, Heading, Text } from "@chakra-ui/react";
import ProgressLoader from "@/components/ProgressLoader";
import { OrganizationRole } from "@/util/types";
import { Trans } from "react-i18next";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  useGetOrganizationQuery,
  useGetProjectsQuery,
  useGetProjectUsersQuery,
} from "@/services/api";
import { useRouter } from "next/navigation";
import { uniqBy } from "lodash";
import { TFunction } from "i18next";
import ProjectList from "@/app/[lng]/organization/[id]/account-settings/project/projectList";
import ProjectDetails from "@/app/[lng]/organization/[id]/account-settings/project/projectDetails";

export const TagMapping = {
  [OrganizationRole.ORG_ADMIN]: { color: "green", text: "owner" },
  [OrganizationRole.ADMIN]: { color: "blue", text: "admin" },
  [OrganizationRole.COLLABORATOR]: { color: "yellow", text: "collaborator" },
};

interface UseProjectDataProps {
  organizationId: string;
  selectedProjectId: string | null;
  selectedCityId: string | null;
}

const useProjectData = ({
  organizationId,
  selectedProjectId,
  selectedCityId,
}: UseProjectDataProps) => {
  const { data: organization, isLoading: isOrganizationLoading } =
    useGetOrganizationQuery(organizationId);
  const { data: projectsData, isLoading: isProjectsLoading } =
    useGetProjectsQuery({ organizationId }, { skip: !organizationId });
  const { data: projectUsers, isLoading: isProjectUsersLoading } =
    useGetProjectUsersQuery(selectedProjectId || "", {
      skip: !selectedProjectId,
    });

  const { numCities, totalCities } = useMemo(() => {
    return (
      organization?.projects.reduce(
        (acc, proj) => ({
          numCities: acc.numCities + (proj?.cities?.length ?? 0),
          totalCities: acc.totalCities + BigInt(proj?.cityCountLimit),
        }),
        { numCities: 0, totalCities: BigInt(0) },
      ) ?? { numCities: 0, totalCities: BigInt(0) }
    );
  }, [organization?.projects]);

  const selectedProjectData = useMemo(() => {
    return projectsData?.find(
      (project) => project.projectId === selectedProjectId,
    );
  }, [selectedProjectId, projectsData]);

  const selectedCityData = useMemo(() => {
    return selectedProjectData?.cities.find(
      (city) => city.cityId === selectedCityId,
    );
  }, [selectedCityId, selectedProjectData]);

  const userList = useMemo(() => {
    if (!projectUsers) return [];
    if (selectedCityId) {
      return projectUsers
        .filter(
          (user) =>
            user.cityId === selectedCityId ||
            user.role === OrganizationRole.ORG_ADMIN ||
            user.role === OrganizationRole.ADMIN,
        )
        .map((user) => ({ ...user, role: user.role }));
    }
    return uniqBy(projectUsers, "email");
  }, [projectUsers, selectedCityId]);

  return {
    organization,
    isOrganizationLoading,
    projectsData,
    isProjectsLoading,
    projectUsers,
    isProjectUsersLoading,
    numCities,
    totalCities,
    selectedProjectData,
    selectedCityData,
    userList,
  };
};

interface ProjectOverviewProps {
  t: TFunction;
  organizationName?: string;
  projectCount: number;
  totalCities: bigint;
}

const ProjectOverview: React.FC<ProjectOverviewProps> = ({
  t,
  organizationName,
  projectCount,
  totalCities,
}) => (
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
      {t("Projects")}
    </Heading>
    <Text color="content.tertiary" fontSize="body.lg">
      <Trans
        i18nKey="projects-description"
        t={t}
        values={{
          orgName: organizationName,
          projectCount: projectCount,
          cityCount: totalCities,
        }}
        components={{ bold: <strong /> }}
      />
    </Text>
  </Box>
);

const ProjectSettings = ({ lng, id }: { lng: string; id: string }) => {
  const { t } = useTranslation(lng, "settings");
  const router = useRouter();

  const [selectedProjectId, setSelectedProjectId] = useState<string[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState("city");

  const {
    organization,
    isOrganizationLoading,
    projectsData,
    isProjectsLoading,
    projectUsers,
    isProjectUsersLoading,
    totalCities,
    selectedProjectData,
    selectedCityData,
    userList,
  } = useProjectData({
    organizationId: id,
    selectedProjectId:
      selectedProjectId.length > 0 ? selectedProjectId[0] : null,
    selectedCityId,
  });

  useEffect(() => {
    if (projectsData?.length && selectedProjectId.length === 0) {
      setSelectedProjectId([projectsData[0].projectId]);
      setSelectedCityId(null);
    }
  }, [projectsData, selectedProjectId.length]);

  useEffect(() => {
    if (selectedCityId) {
      setTabValue("inventories");
    } else {
      setTabValue("city");
    }
  }, [selectedCityId]);

  if (isOrganizationLoading || isProjectsLoading) {
    return <ProgressLoader />;
  }

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <ProjectOverview
          t={t}
          organizationName={organization?.name}
          projectCount={organization?.projects?.length ?? 0}
          totalCities={totalCities}
        />
      </Box>
      {projectsData?.length === 0 && (
        <Text
          mt={12}
          fontSize="Heading.sm"
          fontWeight={600}
          color="content.primary"
        >
          {t("no-data")}
        </Text>
      )}
      <Box
        display="flex"
        gap={9}
        mt={12}
        alignItems="flex-start"
        justifyContent="space-between"
      >
        {projectsData && projectsData.length > 0 && (
          <>
            <ProjectList
              t={t}
              projects={projectsData}
              selectedProjectId={selectedProjectId}
              setSelectedProject={setSelectedProjectId}
              setSelectedCity={setSelectedCityId}
              selectedCity={selectedCityId}
            />
            <ProjectDetails
              t={t}
              lng={lng}
              router={router}
              selectedCity={selectedCityId}
              selectedProjectData={selectedProjectData}
              selectedCityData={selectedCityData}
              organizationName={organization?.name}
              projectUsers={projectUsers || []}
              userList={userList}
              isLoadingProjectUsers={isProjectUsersLoading}
              tabValue={tabValue}
              setTabValue={setTabValue}
              setSelectedCity={setSelectedCityId}
            />
          </>
        )}
      </Box>
    </Box>
  );
};

export default ProjectSettings;
