import {
  DrawerBackdrop,
  DrawerBody,
  DrawerContent,
  DrawerRoot,
} from "@/components/ui/drawer";
import { OpenChangeDetails } from "@zag-js/popover";
import { Box, Icon, Input, Link, Text, VStack } from "@chakra-ui/react";
import {
  MdAdd,
  MdCardTravel,
  MdCheck,
  MdInsertChart,
  MdOpenInNew,
  MdSearch,
} from "react-icons/md";
import { InputGroup } from "@/components/ui/input-group";
import { LuLayoutGrid } from "react-icons/lu";
import { BiCaretDown } from "react-icons/bi";
import type { ProjectWithCitiesResponse } from "@/util/types";
import { uniqueBy } from "@/util/array";
import {
  api,
  useGetUserProjectsQuery,
  useGetModulesQuery,
  useGetProjectModulesQuery,
  useGetUserAccessStatusQuery,
} from "@/services/api";
import React, { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { CloseButton } from "@/components/ui/close-button";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/i18n/client";
import type { TFunction } from "i18next";

import { NavigationAccordion } from "../ui/navigation-accordion";
import { CustomSelect } from "../ui/custom-select";
import ProgressLoader from "../ProgressLoader";
import { stageOrder, stageIcons } from "@/config/stages";
import { getDashboardPath } from "@/util/routes";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";
import { isModuleVisible } from "@/util/module-visibility";
import { useCitySwitchNavigation } from "@/hooks/useCitySwitchNavigation";

const ProjectFilterSection = ({
  t,
  projectsData,
  lng,
  currentCityId,
  organizationId,
}: {
  t: TFunction;
  projectsData: ProjectWithCitiesResponse;
  lng: string;
  currentCityId?: string;
  organizationId?: string;
}) => {
  const router = useRouter();
  const navigateToCity = useCitySwitchNavigation(lng);
  const [selectedProject, setSelectedProject] = useState<string>("");

  // Check user access status for permission-based UI
  const { data: userAccessStatus } = useGetUserAccessStatusQuery({});
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Modules enabled for the currently selected project, used to decide
  // whether the active module can be preserved when switching cities.
  const { data: projectModulesForSwitch } = useGetProjectModulesQuery(
    selectedProject,
    { skip: !selectedProject },
  );

  // Initialize with current project and city based on currentCityId
  useEffect(() => {
    if (currentCityId && projectsData) {
      // Find the project and city that contains the current inventory
      for (const project of projectsData) {
        for (const city of project.cities) {
          if (city.cityId === currentCityId) {
            setSelectedProject(project.projectId);
            setSelectedCity(city.cityId);
            return;
          }
        }
      }
    }
  }, [currentCityId, projectsData]);

  // Transform projectsData into options for the project select
  const projectOptions = projectsData.map((project) => ({
    value: project.projectId,
    label:
      project.name === "cc_project_default"
        ? t("default-project")
        : project.name,
  }));

  // Get cities for the selected project
  const selectedProjectData = projectsData.find(
    (project) => project.projectId === selectedProject,
  );

  // Transform cities into options for the city select
  const cityOptions = selectedProjectData
    ? selectedProjectData.cities.map((city) => ({
        value: city.cityId,
        label: city.name,
      }))
    : [];

  // Filter projects based on search term
  const filteredProjectOptions = projectOptions.filter((project) =>
    project.label.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Filter cities based on search term
  const filteredCityOptions = cityOptions.filter((city) =>
    city.label.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Handle search and auto-select
  const handleSearch = (value: string) => {
    setSearchTerm(value);

    if (!value.trim()) return;

    // First, try to find a project that matches
    const matchingProject = projectOptions.find((project) =>
      project.label.toLowerCase().includes(value.toLowerCase()),
    );

    if (matchingProject) {
      setSelectedProject(matchingProject.value);
      setSelectedCity(""); // Reset city when project changes
      return;
    }

    // If no project matches, try to find a city across all projects
    for (const project of projectsData) {
      const matchingCity = project.cities.find((city) =>
        city.name.toLowerCase().includes(value.toLowerCase()),
      );

      if (matchingCity) {
        setSelectedProject(project.projectId);
        setSelectedCity(matchingCity.cityId);
        return;
      }
    }
  };

  // Get search results for display
  const getSearchResults = () => {
    if (!searchTerm.trim()) return [];
    const RESULTS_LIMIT = 5;

    const results: Array<{
      value: string;
      label: string;
      type: "project" | "city";
      projectId?: string;
      projectName?: string;
    }> = [];

    // Add matching projects
    const matchingProjects = projectOptions.filter((project) =>
      project.label.toLowerCase().includes(searchTerm.toLowerCase()),
    );
    results.push(
      ...matchingProjects.map((project) => ({
        ...project,
        type: "project" as const,
      })),
    );

    // Add matching cities from all projects
    projectsData.forEach((project) => {
      const matchingCities = project.cities.filter((city) =>
        city.name.toLowerCase().includes(searchTerm.toLowerCase()),
      );
      results.push(
        ...matchingCities.map((city) => ({
          value: city.cityId,
          label: `${city.name}`,
          type: "city" as const,
          projectId: project.projectId,
          projectName: project.name,
          inventoryId: city.inventories?.[0]?.inventoryId,
        })),
      );
    });

    return results.slice(0, RESULTS_LIMIT); // Limit to 5 results
  };

  const searchResults = getSearchResults();

  // Handle city selection and navigation, preserving the current module
  // (GHGI/HIAP/MEED/dashboard) for the new city when it's available.
  const handleCitySelection = (cityId: string) => {
    navigateToCity(cityId, projectModulesForSwitch ?? []);
  };

  return (
    <Box
      w="full"
      h="auto"
      display="flex"
      flexDirection="column"
      gap={"24px"}
      pb="6"
    >
      {/* Filter Section */}
      <Box display="flex" flexDirection="column" gap="6" w="full">
        {/* Search Input */}
        <InputGroup startElement={<Icon as={MdSearch} size="md" />}>
          <Input
            h="12"
            fontSize="md"
            placeholder={t("search-by-city-or-project")}
            borderRadius="4px"
            borderWidth="1px"
            borderColor="border.neutral"
            shadow="sm"
            bg="base.light"
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </InputGroup>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <Box
            position="absolute"
            top="95px"
            left="0"
            right="0"
            bg="base.light"
            border="1px solid"
            borderColor="border.neutral"
            borderRadius="8px"
            boxShadow="0 4px 12px rgba(0, 0, 0, 0.15)"
            maxH="300px"
            overflowY="auto"
            zIndex={1000}
            py="8px"
          >
            {searchResults.map((result, index) => (
              <Box
                key={`${result.type}-${result.value}-${index}`}
                px="16px"
                py="12px"
                cursor="pointer"
                _hover={{
                  bg: "content.link",
                  "& .search-result-label": {
                    color: "base.light",
                  },
                  "& .search-result-city-label": {
                    color: "base.light",
                  },
                }}
                onClick={() => {
                  if (result.type === "project") {
                    setSelectedProject(result.value);
                    setSelectedCity("");
                  } else {
                    if (result.projectId) {
                      setSelectedProject(result.projectId);
                      setSelectedCity(result.value);
                      // Navigate to the city's inventory
                      handleCitySelection(result.value);
                    }
                  }
                  setSearchTerm("");
                }}
              >
                <VStack gap={2} alignItems="flex-start">
                  <Text
                    className="search-result-label"
                    fontSize="body.lg"
                    fontWeight="medium"
                    color="content.secondary"
                  >
                    {result.label}
                  </Text>
                  {result.type === "city" && (
                    <Text
                      className="search-result-city-label"
                      fontSize="body.md"
                      color="content.tertiary"
                    >
                      {result.projectName} | {result.label}
                    </Text>
                  )}
                </VStack>
              </Box>
            ))}
          </Box>
        )}
        {/* Project dropdown */}
        <Box display="flex" flexDirection="column" gap="6">
          {/* Project Dropdown */}
          <CustomSelect
            options={filteredProjectOptions}
            value={selectedProject}
            onChange={(value) => {
              setSelectedProject(value);
              setSelectedCity(""); // Reset city when project changes
              setSearchTerm(""); // Clear search when project is selected
            }}
            placeholder={t("select-project")}
            height="300px"
            t={t}
            label={t("project")}
          />
          {/* All Projects Button */}
          <Box w="full" display="flex" justifyContent="flex-start">
            <Button
              variant="outline"
              onClick={() =>
                router.push(
                  organizationId
                    ? `/${lng}/organization/${organizationId}/project`
                    : `/${lng}/cities`,
                )
              }
              rounded="pill"
              borderColor="interactive.secondary"
              border="sm"
              h="12"
              px={6}
              gap={2}
              _hover={{ bg: "background.neutral" }}
            >
              <Icon as={LuLayoutGrid} color="interactive.secondary" boxSize={5} />
              <Text
                fontSize="button.md"
                fontWeight="bold"
                color="interactive.secondary"
              >
                {t("all-projects")}
              </Text>
            </Button>
          </Box>
          {/* City Dropdown */}
          <CustomSelect
            options={filteredCityOptions}
            value={selectedCity}
            onChange={(value) => {
              setSelectedCity(value);
              setSearchTerm(""); // Clear search when city is selected
              // Navigate to the city's inventory
              if (selectedProject && value) {
                handleCitySelection(value);
              }
            }}
            placeholder={t("select-city")}
            height="300px"
            t={t}
            label={t("city")}
          />
          <Box w="full" display="flex" gap={3}>
            {/* Only show add city button for ORG_ADMIN and PROJECT_ADMIN */}
            {(userAccessStatus?.isOrgOwner ||
              userAccessStatus?.isProjectAdmin) && (
              <Button
                variant="outline"
                onClick={() => {
                  router.push(
                    `/${lng}/cities/onboarding?project=${selectedProject}`,
                  );
                }}
                rounded="pill"
                borderColor="interactive.secondary"
                border="sm"
                minH="12"
                h="auto"
                py={2}
                px={5}
                gap={2}
                flex={1}
                minW={0}
                _hover={{ bg: "background.neutral" }}
              >
                <Icon
                  as={MdAdd}
                  color="interactive.secondary"
                  boxSize={5}
                  flexShrink={0}
                />
                <Text
                  fontSize="body.sm"
                  lineHeight="1.2"
                  fontWeight="bold"
                  color="interactive.secondary"
                  whiteSpace="normal"
                  textAlign="center"
                  lineClamp={2}
                >
                  {t("add-new-city")}
                </Text>
              </Button>
            )}
            {/* Go to the selected city's dashboard */}
            <Button
              variant="outline"
              onClick={() => router.push(getDashboardPath(lng, selectedCity))}
              disabled={!selectedCity}
              rounded="pill"
              borderColor="interactive.secondary"
              border="sm"
              minH="12"
              h="auto"
              py={2}
              px={5}
              gap={2}
              flex={1}
              minW={0}
              _hover={{ bg: "background.neutral" }}
            >
              <Icon
                as={MdInsertChart}
                color="interactive.secondary"
                boxSize={5}
                flexShrink={0}
              />
              <Text
                fontSize="body.sm"
                lineHeight="1.2"
                fontWeight="bold"
                color="interactive.secondary"
                whiteSpace="normal"
                textAlign="center"
                lineClamp={2}
              >
                {t("dashboard")}
              </Text>
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

const JNDrawer = ({
  isOpen,
  lng,
  organizationId,
  onClose,
  onOpenChange,
  currentCityId,
}: {
  lng: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenChange: (val: OpenChangeDetails) => void;
  organizationId?: string;
  currentCityId?: string;
}) => {
  const { t } = useTranslation(lng, "dashboard");
  const router = useRouter();
  const navigateToCity = useCitySwitchNavigation(lng);
  const { data: projectsData, isLoading } = useGetUserProjectsQuery({});
  const { organization, setOrganization } = useOrganizationContext();
  const { data: rawOrganizations } = api.useGetUserOrganizationsQuery(
    undefined,
    {
      skip: !isOpen,
    },
  );
  const organizations = useMemo(
    () =>
      rawOrganizations &&
      uniqueBy(rawOrganizations, (org) => org.organizationId),
    [rawOrganizations],
  );
  const [getProjectsForOrganization] = api.useLazyGetProjectsQuery();
  const [getProjectModulesTrigger] = api.useLazyGetProjectModulesQuery();
  const [isOrgMenuOpen, setOrgMenuOpen] = useState(false);

  const [selectedProject, setSelectedProject] = React.useState<string | null>();
  const [selectedCity, setSelectedCity] = React.useState<string>("");

  // Prefer explicit org context, then access-status prop, then first accessible project.
  const resolvedOrganizationId =
    organizationId ||
    projectsData?.find((project) => project.organizationId)?.organizationId;

  const hasMultipleOrganizations = !!organizations && organizations.length > 1;

  const currentOrganizationName = organizations?.find(
    (org) =>
      org.organizationId ===
      (organization?.organizationId ?? resolvedOrganizationId),
  )?.name;

  async function onChangeOrganization(newOrganizationId: string) {
    if (newOrganizationId === organization?.organizationId) return;
    setOrganization({ organizationId: newOrganizationId });
    const projects = await getProjectsForOrganization({
      organizationId: newOrganizationId,
    })
      .unwrap()
      .catch(() => []);

    const targetProject = projects
      .flatMap((project) => project.cities.map((city) => ({ project, city })))
      .sort((a, b) => a.city.name.localeCompare(b.city.name))[0];

    if (!targetProject) {
      router.push(`/${lng}/cities/onboarding`);
      onClose();
      return;
    }

    const newProjectModules = await getProjectModulesTrigger(
      targetProject.project.projectId,
    )
      .unwrap()
      .catch(() => []);

    navigateToCity(targetProject.city.cityId, newProjectModules);
    onClose();
  }

  // Module data fetching
  const { data: allModules } = useGetModulesQuery();
  const { data: projectModules } = useGetProjectModulesQuery(
    selectedProject!,
    { skip: !selectedProject },
  );

  // Initialize with current project and city based on currentCityId
  useEffect(() => {
    if (currentCityId && projectsData) {
      // Find the project and city that contains the current inventory
      for (const project of projectsData) {
        for (const city of project.cities) {
          if (city.cityId === currentCityId) {
            setSelectedProject(project.projectId);
            setSelectedCity(city.cityId);
            return;
          }
        }
      }
    }
  }, [currentCityId, projectsData]);

  // Module filtering by stage - same logic as HomePage
  const modulesByStage = useMemo(() => {
    if (!allModules) return {};
    return allModules.reduce(
      (acc, mod) => {
        if (!acc[mod.stage]) acc[mod.stage] = [];
        acc[mod.stage].push(mod);
        return acc;
      },
      {} as Record<string, typeof allModules>,
    );
  }, [allModules]);

  return (
    <DrawerRoot
      open={isOpen}
      placement="start"
      onOpenChange={onOpenChange}
      size="sm"
    >
      <DrawerBackdrop />
      <DrawerContent
        borderRadius="0px 8px 8px 0px"
        h="100dvh"
        display="flex"
        flexDirection="column"
      >
        <Box
          flexShrink={0}
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          bg="background.neutral"
          px={6}
          py={5}
          borderTopRightRadius="8px"
        >
          {hasMultipleOrganizations ? (
            <MenuRoot
              open={isOrgMenuOpen}
              onOpenChange={(details) => setOrgMenuOpen(details.open)}
              variant="solid"
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
                <MenuTrigger asChild>
                  <Box
                    as="button"
                    appearance="none"
                    display="flex"
                    alignItems="center"
                    justifyContent="space-between"
                    gap="8px"
                    minW="160px"
                    h="12"
                    px="16px"
                    bg="base.light"
                    fontFamily="heading"
                    border="1px solid"
                    borderColor="border.neutral"
                    borderRadius="4px"
                    shadow="sm"
                    outline="none"
                    cursor="pointer"
                    _hover={{ borderColor: "content.link" }}
                    _focus={{
                      outline: "none",
                      borderColor: "content.link",
                      boxShadow: "0 0 0 1px content.link",
                    }}
                  >
                    <Text
                      fontFamily="body"
                      fontSize="md"
                      fontWeight="normal"
                      lineHeight="24"
                      color="content.primary"
                      maxW="160px"
                      overflow="hidden"
                      textOverflow="ellipsis"
                      whiteSpace="nowrap"
                    >
                      {currentOrganizationName}
                    </Text>
                    <Icon
                      as={BiCaretDown}
                      color="interactive.control"
                      boxSize={5}
                      transition="transform 0.2s"
                      transform={
                        isOrgMenuOpen ? "rotate(180deg)" : "rotate(0deg)"
                      }
                    />
                  </Box>
                </MenuTrigger>
              </Box>
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
                fontFamily="body"
                fontWeight="regular"
                lineHeight="24"
                color="content.primary"
                maxW="160px"
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
              >
                {currentOrganizationName}
              </Text>
            </Box>
          )}
          <CloseButton onClick={onClose} color="content.alternative" />
        </Box>
        <DrawerBody
          paddingY={6}
          display="flex"
          flexDirection="column"
          flex="1"
          minH={0}
          overflowY="auto"
        >
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
                <ProgressLoader />
              </Box>
            </Box>
          )}

          {/* Project / City Filter Section*/}
          {!isLoading && projectsData && (
            <>
              <ProjectFilterSection
                t={t}
                projectsData={projectsData}
                lng={lng}
                currentCityId={currentCityId}
                organizationId={resolvedOrganizationId}
              />
              <Box
                w="auto"
                mx="-6"
                borderBottom="1px solid"
                borderColor="border.neutral"
                flexShrink={0}
              />
              {/* Dynamic Module Accordions - based on HomePage logic */}
              {modulesByStage && projectModules && selectedProject && (
                <Box display="flex" flexDirection="column" flexShrink={0}>
                  <Text
                    fontSize="label.lg"
                    color="content.tertiary"
                    fontFamily="heading"
                    fontWeight="semibold"
                    pt={4}
                    flexShrink={0}
                  >
                    {t("all-tools")}
                  </Text>
                  <Box maxH="500px" overflowY="auto">
                    {stageOrder.map((stage) => {
                      const modules = projectModules.filter((mod) => {
                        return mod.stage === stage && isModuleVisible(mod.id);
                      });

                      if (modules.length === 0) return null;

                      return (
                        <NavigationAccordion
                          key={stage}
                          title={t("journey." + stage)}
                          icon={stageIcons[stage]}
                          items={modules.map((mod) => {
                            // External tool URLs (e.g. Replit apps) must not be
                            // prefixed with the city path — that produced
                            // .../cities/{id}https://... (CC-651).
                            const isExternal =
                              mod.url.startsWith("http://") ||
                              mod.url.startsWith("https://");
                            return {
                              label:
                                mod.name[lng] ||
                                mod.name.en ||
                                mod.name[Object.keys(mod.name)[0]] ||
                                mod.id,
                              href: isExternal
                                ? mod.url
                                : `/${lng}/cities/${selectedCity}${mod.url}`,
                            };
                          })}
                          t={t}
                        />
                      );
                    })}
                  </Box>
                </Box>
              )}
            </>
          )}

          <Box
            w="auto"
            mx="-6"
            borderBottom="1px solid"
            borderColor="border.neutral"
            flexShrink={0}
          />
          {/* Useful links */}
          <Box
            display="flex"
            flexDirection="column"
            gap="16px"
            py={4}
            flexShrink={0}
          >
            <Text
              fontSize="label.lg"
              color="content.tertiary"
              fontFamily="heading"
              fontWeight="semibold"
            >
              {t("useful-links")}
            </Text>
            <Link
              href="https://citycatalyst.openearth.org/learning-hub"
              target="_blank"
              rel="help noopener"
              display="flex"
              alignItems="center"
              gap="8px"
              color="content.tertiary"
            >
              <Text
                fontFamily="body"
                fontSize="body.lg"
                fontWeight="regular"
                lineHeight="24"
                letterSpacing="wide"
                color="content.tertiary"
              >
                {t("learning-hub")}
              </Text>
              <Icon as={MdOpenInNew} boxSize="18px" color="content.link" />
            </Link>
          </Box>
        </DrawerBody>
      </DrawerContent>
    </DrawerRoot>
  );
};

export default JNDrawer;
