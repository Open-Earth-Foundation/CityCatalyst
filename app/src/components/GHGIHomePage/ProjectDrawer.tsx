import {
  DrawerBackdrop,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
} from "@/components/ui/drawer";
import { OpenChangeDetails } from "@zag-js/popover";
import { Box, HStack, Icon, IconButton, Input, Text } from "@chakra-ui/react";
import {
  MdAdd,
  MdArrowDropDown,
  MdArrowDropUp,
  MdCardTravel,
  MdCheck,
  MdClose,
  MdKeyboardArrowRight,
  MdOutlineLocationOn,
} from "react-icons/md";
import { InputGroup } from "@/components/ui/input-group";
import { LuSearch } from "react-icons/lu";
import type {
  CityResponse,
  ProjectWithCities,
  ProjectWithCitiesResponse,
} from "@/util/types";
import {
  api,
  useGetProjectsQuery,
  useGetProjectUsersQuery,
  useGetUserProjectsQuery,
} from "@/services/api";
import {
  ProgressCircleRing,
  ProgressCircleRoot,
} from "@/components/ui/progress-circle";
import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import { useRouter } from "next/navigation";
import { FaLocationDot } from "react-icons/fa6";
import { useTranslation } from "@/i18n/client";
import ProjectLimitModal from "@/components/project-limit";
import SearchInput from "@/components/SearchInput";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { UserRole } from "@/util/types";
import { logger } from "@/services/logger";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";

const ProjectList = ({
  t,
  data,
  selectProject,
}: {
  t: Function;
  data: ProjectWithCitiesResponse;
  selectProject: (projectId: string) => void;
}) => {
  const [searchTerm, setSearchTerm] = React.useState("");

  const filteredProjectList = useMemo(() => {
    if (!searchTerm) return data;

    return data.filter((project) =>
      project.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [data, searchTerm]);

  return (
    <HStack flexDirection="column" alignItems="start" gap={6}>
      <Text
        fontSize="title.md"
        textTransform="capitalize"
        fontWeight="semibold"
        color="content.tertiary"
      >
        {t("projects")}
      </Text>
      <SearchInput searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
      <Box w="full">
        {filteredProjectList.map((project) => (
          <Button
            variant="ghost"
            rounded={0}
            display="flex"
            justifyContent="space-between"
            w="full"
            key={project.projectId}
            onClick={() => selectProject(project.projectId)}
          >
            <Text
              fontSize="body.lg"
              fontWeight="regular"
              color="content.primary"
            >
              {project.name === "cc_project_default"
                ? t("default-project")
                : project.name}
            </Text>
            <Icon color="content.primary" as={MdKeyboardArrowRight} />
          </Button>
        ))}
      </Box>
    </HStack>
  );
};

const SingleProjectView = ({
  project,
  backToProjects,
  t,
  lng,
  currentInventoryId,
}: {
  project: ProjectWithCities;
  backToProjects: () => void;
  t: Function;
  lng: string;
  currentInventoryId: string;
}) => {
  const router = useRouter();
  const [isProjectLimitModalOpen, setIsProjectLimitModalOpen] = useState(false);

  // Check user permissions for this project
  const { userRole } = useUserPermissions({
    projectId: project.projectId,
    skip: !project.projectId,
  });
  const goToOnboarding = () => {
    if (
      BigInt(project.cities.length) ===
      BigInt(project.cityCountLimit as unknown as string)
    ) {
      setIsProjectLimitModalOpen(true);
    } else {
      router.push(`/cities/onboarding/setup?project=${project.projectId}`);
    }
  };

  const goToCityInventory = (city: CityResponse) => {
    const inventoryId = city.inventories?.[0]?.inventoryId;
    if (!inventoryId) {
      logger.error(
        { cityId: city.cityId },
        "City has no inventories but is listed in ProjectDrawer",
      );
      return;
    }

    router.push(`/${lng}/cities/${city.cityId}/GHGI/${inventoryId}`);
  };

  const [searchTerm, setSearchTerm] = React.useState("");

  const filteredCitiesList = useMemo(() => {
    const citiesWithInventories = project.cities.filter(
      (city) => city.inventories?.length > 0,
    );

    if (!searchTerm) return citiesWithInventories;

    return citiesWithInventories.filter((city) =>
      city.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [project, searchTerm]);

  return (
    <HStack h="full" overflowY="hidden" flexDirection="column" gap={6}>
      <Button
        variant="ghost"
        rounded={0}
        display="flex"
        gap={2}
        justifyContent="flex-start"
        w="full"
        key={project.projectId}
        onClick={backToProjects}
      >
        <Icon
          color="content.primary"
          rotate="180deg"
          as={MdKeyboardArrowRight}
        />
        <Text fontSize="body.lg" color={"content.tertiary"}>
          {project.name === "cc_project_default"
            ? t("default-project")
            : project.name}
        </Text>
      </Button>
      <SearchInput searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
      {/* Only show add city button for ORG_ADMIN and PROJECT_ADMIN */}
      {userRole !== UserRole.COLLABORATOR &&
        userRole !== UserRole.NO_ACCESS && (
          <Button
            variant="ghost"
            w="full"
            justifyContent="start"
            onClick={goToOnboarding}
          >
            <Icon as={MdAdd} color={"content.alternative"} boxSize={6} />
            <Text
              fontSize="body.lg"
              color="content.primary"
              fontWeight="normal"
            >
              {t("add-a-new-city")}
            </Text>
          </Button>
        )}
      <HStack
        flexDirection="column"
        w="full"
        gap={2}
        flex={1}
        overflow="scroll"
      >
        {filteredCitiesList.map((city) => (
          <Button
            variant="ghost"
            rounded={0}
            display="flex"
            justifyContent="flex-start"
            gap={2.5}
            w="full"
            key={city.cityId}
            onClick={() => goToCityInventory(city)}
          >
            {city.inventories.find(
              (inventory) => inventory.inventoryId === currentInventoryId,
            ) ? (
              <Icon color="content.alternative" as={FaLocationDot} />
            ) : (
              <Icon color="content.alternative" as={MdOutlineLocationOn} />
            )}
            <Text fontSize="body.lg" fontWeight={400} color="content.primary">
              {city.name}
            </Text>
          </Button>
        ))}
      </HStack>
      <ProjectLimitModal
        isOpen={isProjectLimitModalOpen}
        onClose={() => setIsProjectLimitModalOpen(false)}
        lng={lng}
        onOpenChange={setIsProjectLimitModalOpen}
      />
    </HStack>
  );
};

const ProjectDrawer = ({
  isOpen,
  lng,
  organizationId,
  onClose,
  onOpenChange,
  currentInventoryId,
}: {
  lng: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenChange: (val: OpenChangeDetails) => void;
  organizationId?: string;
  currentInventoryId?: string;
}) => {
  const { t } = useTranslation(lng, "dashboard");
  const router = useRouter();
  const { data: projectsData, isLoading } = useGetUserProjectsQuery({});
  const { organization, setOrganization } = useOrganizationContext();
  const { data: organizations } = api.useGetUserOrganizationsQuery(undefined, {
    skip: !isOpen,
  });
  const [getProjectsForOrganization] = api.useLazyGetProjectsQuery();
  const [isOrgMenuOpen, setOrgMenuOpen] = useState(false);

  const [selectedProject, setSelectedProject] = React.useState<string | null>();

  const hasMultipleOrganizations = !!organizations && organizations.length > 1;

  const currentOrganizationName = organizations?.find(
    (org) =>
      org.organizationId ===
      (organization?.organizationId ?? organizationId),
  )?.name;

  async function onChangeOrganization(newOrganizationId: string) {
    if (newOrganizationId === organization?.organizationId) return;
    setOrganization({ organizationId: newOrganizationId });
    const projects = await getProjectsForOrganization({
      organizationId: newOrganizationId,
    })
      .unwrap()
      .catch(() => []);
    const cityId = projects
      .flatMap((project) => project.cities)
      .sort((a, b) => a.name.localeCompare(b.name))[0]?.cityId;
    router.push(
      cityId ? `/${lng}/cities/${cityId}` : `/${lng}/cities/onboarding`,
    );
    onClose();
  }

  const selectProject = (projectId: string) => {
    setSelectedProject(projectId);
  };

  const selectedProjectData = useMemo<ProjectWithCities | null>(() => {
    if (!selectedProject) return null;

    return (
      projectsData?.find((project) => project.projectId === selectedProject) ||
      null
    );
  }, [projectsData, selectedProject]);

  return (
    <DrawerRoot
      open={isOpen}
      placement="start"
      onOpenChange={onOpenChange}
      onExitComplete={() => {
        setSelectedProject(null);
      }}
      size="md"
    >
      <DrawerBackdrop />
      <DrawerContent>
        <Box
          display="flex"
          alignItems="center"
          bg="background.neutral"
          px={6}
          py={4}
          flexShrink={0}
        >
          {hasMultipleOrganizations ? (
            <MenuRoot
              open={isOrgMenuOpen}
              onOpenChange={(details) => setOrgMenuOpen(details.open)}
              variant="solid"
            >
              <MenuTrigger asChild>
                <Button
                  variant="ghost"
                  p={0}
                  minW="0"
                  h="auto"
                  _hover={{ bg: "transparent", opacity: 0.8 }}
                >
                  <Box display="flex" alignItems="center" gap={3}>
                    <Box
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      boxSize="40px"
                      borderRadius="full"
                      bg="content.alternative"
                      color="base.light"
                      flexShrink={0}
                    >
                      <Icon as={MdCardTravel} boxSize={5} />
                    </Box>
                    <Text
                      fontSize="title.md"
                      fontWeight="bold"
                      color="content.alternative"
                      maxW="160px"
                      overflow="hidden"
                      textOverflow="ellipsis"
                      whiteSpace="nowrap"
                    >
                      {currentOrganizationName}
                    </Text>
                    <Icon
                      as={isOrgMenuOpen ? MdArrowDropUp : MdArrowDropDown}
                      boxSize={6}
                      color="content.alternative"
                    />
                  </Box>
                </Button>
              </MenuTrigger>
              <MenuContent minW="220px" zIndex={2000}>
                {organizations!.map((org) => (
                  <MenuItem
                    value={org.organizationId}
                    onClick={() => onChangeOrganization(org.organizationId)}
                    key={org.organizationId}
                  >
                    <Box
                      display="flex"
                      alignItems="center"
                      justifyContent="space-between"
                      w="full"
                    >
                      <Text
                        fontSize="title.md"
                        overflow="hidden"
                        textOverflow="ellipsis"
                        whiteSpace="nowrap"
                      >
                        {org.name}
                      </Text>
                      {org.organizationId === organization?.organizationId && (
                        <Icon
                          as={MdCheck}
                          boxSize={5}
                          color="interactive.secondary"
                        />
                      )}
                    </Box>
                  </MenuItem>
                ))}
              </MenuContent>
            </MenuRoot>
          ) : (
            <Box display="flex" alignItems="center" gap={3}>
              <Box
                display="flex"
                alignItems="center"
                justifyContent="center"
                boxSize="40px"
                borderRadius="full"
                bg="content.alternative"
                color="base.light"
                flexShrink={0}
              >
                <Icon as={MdCardTravel} boxSize={5} />
              </Box>
              <Text
                fontSize="title.md"
                fontWeight="bold"
                color="content.alternative"
                maxW="160px"
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
              >
                {currentOrganizationName}
              </Text>
            </Box>
          )}
        </Box>
        <DrawerHeader borderBottomWidth={2} borderColor="background.neutral">
          <DrawerTitle>
            <Box display="flex" justifyContent="space-between">
              <Text fontSize="headline.sm" color="base.dark">
                {t("go-to")}
              </Text>
              <IconButton
                onClick={onClose}
                variant="ghost"
                color="interactive.control"
              >
                <Icon as={MdClose} />
              </IconButton>
            </Box>
          </DrawerTitle>
        </DrawerHeader>
        <DrawerBody paddingY={6}>
          {isLoading && (
            <Box
              display="flex"
              justifyContent="center"
              alignItems="center"
              w="full"
            >
              <Box
                w="full"
                py={12}
                display="flex"
                justifyContent="center"
                alignItems="center"
              >
                <ProgressCircleRoot value={null}>
                  <ProgressCircleRing cap="round" />
                </ProgressCircleRoot>
              </Box>
            </Box>
          )}
          {!isLoading && projectsData && !selectedProject && (
            <ProjectList
              t={t}
              data={projectsData}
              selectProject={selectProject}
            />
          )}
          {selectedProjectData && currentInventoryId && (
            <SingleProjectView
              t={t}
              currentInventoryId={currentInventoryId}
              project={selectedProjectData}
              lng={lng}
              backToProjects={() => setSelectedProject(null)}
            />
          )}
        </DrawerBody>
      </DrawerContent>
    </DrawerRoot>
  );
};

export default ProjectDrawer;
