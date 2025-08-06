import {
  DrawerBackdrop,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
} from "@/components/ui/drawer";
import { OpenChangeDetails } from "@zag-js/popover";
import {
  Accordion,
  Box,
  createListCollection,
  HStack,
  Icon,
  IconButton,
  Input,
  Link,
  NativeSelect,
  Popover,
  Portal,
  Select,
  Span,
  Text,
  useSelectContext,
  VStack,
} from "@chakra-ui/react";
import {
  MdAdd,
  MdClose,
  MdKeyboardArrowRight,
  MdOutlineLocationOn,
  MdSearch,
  MdKeyboardArrowDown,
  MdHome,
} from "react-icons/md";
import { InputGroup } from "@/components/ui/input-group";
import { LuLayoutGrid, LuSearch } from "react-icons/lu";
import type {
  CityResponse,
  ProjectWithCities,
  ProjectWithCitiesResponse,
} from "@/util/types";
import {
  useGetProjectsQuery,
  useGetProjectUsersQuery,
  useGetUserProjectsQuery,
  useGetModulesQuery,
  useGetProjectModulesQuery,
  api,
} from "@/services/api";
import {
  ProgressCircleRing,
  ProgressCircleRoot,
} from "@/components/ui/progress-circle";
import React, { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { FaLocationDot } from "react-icons/fa6";
import { useTranslation } from "@/i18n/client";
import ProjectLimitModal from "@/components/project-limit";
import SearchInput from "@/components/SearchInput";
import { logger } from "@/services/logger";
import { Field } from "../ui/field";
import { RiForbidLine } from "react-icons/ri";
import {
  BiArrowFromRight,
  BiArrowToRight,
  BiCaretDown,
  BiChevronDown,
  BiHomeAlt,
  BiSolidBarChartAlt2,
} from "react-icons/bi";
import { HiHome } from "react-icons/hi2";
import { IoMdEye } from "react-icons/io";
import { CgEye, CgEyeAlt } from "react-icons/cg";
import { GoArrowRight } from "react-icons/go";
import { PlanIcon } from "../icons";
import { NavigationAccordion } from "../ui/navigation-accordion";
import { NavigationLinks } from "../ui/navigation-links";
import { StageNames } from "@/util/constants";

// Custom Select Component
interface CustomSelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  options: CustomSelectOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  width?: string;
  height?: string;
  t: Function;
  label: string;
}

const CustomSelect: React.FC<CustomSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  width = "347px",
  height = "300px",
  t,
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOption, setSelectedOption] =
    useState<CustomSelectOption | null>(
      value ? options.find((opt) => opt.value === value) || null : null,
    );

  // Update selectedOption when value or options change
  useEffect(() => {
    if (value) {
      const foundOption = options.find((opt) => opt.value === value);
      setSelectedOption(foundOption || null);
    } else {
      setSelectedOption(null);
    }
  }, [value, options]);

  const handleSelect = (option: CustomSelectOption) => {
    setSelectedOption(option);
    onChange(option.value);
    setIsOpen(false);
  };

  return (
    <Box position="relative" w="347px">
      <Text
        as="label"
        fontSize="label.md"
        color="content.tertiary"
        fontFamily="heading"
        fontWeight="semibold"
      >
        {t(label)}
      </Text>
      {/* Select Trigger */}
      <Box
        as="button"
        w="auto"
        h="48px"
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        px="16px"
        bg="base.light"
        paddingLeft="0px"
        fontFamily="heading"
        fontSize="title.md"
        fontWeight="bold"
        border="none"
        borderColor="border.neutral"
        borderRadius="0px"
        gap="8px"
        cursor="pointer"
        _hover={{
          borderColor: "content.secondary",
        }}
        _focus={{
          outline: "none",
          borderColor: "content.link",
          borderBottomWidth: "3px",
          borderBottomStyle: "solid",
          boxShadow: "0 0 0 1px content.link",
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Text
          fontSize="body.lg"
          color={selectedOption ? "content.primary" : "content.tertiary"}
          fontWeight="medium"
        >
          {selectedOption ? selectedOption.label : placeholder}
        </Text>
        <Icon
          as={BiCaretDown}
          color="interactive.control"
          boxSize={5}
          transition="transform 0.2s"
          transform={isOpen ? "rotate(180deg)" : "rotate(0deg)"}
        />
      </Box>

      {/* Dropdown Menu */}
      {isOpen && (
        <Box
          position="absolute"
          top="100%"
          left="-30px"
          right="0"
          mt="0px"
          w="347px"
          bg="base.light"
          border="1px solid"
          borderColor="border.neutral"
          borderRadius="8px"
          boxShadow="0 4px 12px rgba(0, 0, 0, 0.15)"
          maxH={height}
          overflowY="auto"
          zIndex={1000}
          py="12px"
        >
          {options.map((option) => (
            <Box
              key={option.value}
              px="16px"
              display="flex"
              alignItems="center"
              h="72px"
              cursor="pointer"
              _hover={{
                bg: "content.link",
                color: "base.light",
              }}
              _selected={{
                bg: "content.link",
                color: "base.light",
              }}
              onClick={() => handleSelect(option)}
            >
              <Text fontSize="body.lg" fontWeight="medium">
                {option.label}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Backdrop to close dropdown */}
      {isOpen && (
        <Box
          position="fixed"
          top="0"
          left="0"
          right="0"
          bottom="0"
          zIndex={999}
          onClick={() => setIsOpen(false)}
        />
      )}
    </Box>
  );
};

const ProjectFilterSection = ({
  t,
  projectsData,
  lng,
  currentInventoryId,
}: {
  t: Function;
  projectsData: ProjectWithCitiesResponse;
  lng: string;
  currentInventoryId?: string;
}) => {
  const router = useRouter();
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Initialize with current project and city based on currentInventoryId
  useEffect(() => {
    if (currentInventoryId && projectsData) {
      // Find the project and city that contains the current inventory
      for (const project of projectsData) {
        for (const city of project.cities) {
          if (
            city.inventories?.some(
              (inv) => inv.inventoryId === currentInventoryId,
            )
          ) {
            setSelectedProject(project.projectId);
            setSelectedCity(city.cityId);
            return;
          }
        }
      }
    }
  }, [currentInventoryId, projectsData]);

  // Transform projectsData into options for the project select
  const projectOptions = projectsData.map((project) => ({
    value: project.projectId,
    label: project.name,
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

    return results.slice(0, 5); // Limit to 5 results
  };

  const searchResults = getSearchResults();

  // Handle city selection and navigation
  const handleCitySelection = (cityId: string, projectId: string) => {
    const project = projectsData.find((p) => p.projectId === projectId);
    const city = project?.cities.find((c) => c.cityId === cityId);

    if (city && city.inventories && city.inventories.length > 0) {
      const inventoryId = city.inventories[0].inventoryId;
      if (inventoryId) {
        router.push(`/${lng}/${inventoryId}`);
      }
    }
  };

  return (
    <Box
      w="full"
      h="auto"
      display="flex"
      flexDirection="column"
      gap={"24px"}
      py="24px"
    >
      {/* Filter Section */}
      <Box display="flex" flexDirection="column" gap={"24px"} w="full">
        {/* Search Input */}
        <InputGroup startElement={<Icon as={MdSearch} size="md" />}>
          <Input
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
            top="65px"
            left="24px"
            right="0"
            w="347px"
            mt="4px"
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
                  color: "base.light",
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
                      handleCitySelection(result.value, result.projectId);
                    }
                  }
                  setSearchTerm("");
                }}
              >
                <VStack gap={2} alignItems="flex-start">
                  <Text fontSize="body.lg" fontWeight="medium">
                    {result.label}
                  </Text>
                  <Box>
                    {result.type === "city" && (
                      <Text fontSize="body.md" color="content.tertiary">
                        {result.projectName} | {result.label}
                      </Text>
                    )}
                  </Box>
                </VStack>
              </Box>
            ))}
          </Box>
        )}
        {/* Project dropdown */}
        <Box display="flex" flexDirection="column" px={4} gap="24px">
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
            width="347px"
            height="300px"
            t={t}
            label={t("project")}
          />
          {/* City Dropdown */}
          <CustomSelect
            options={filteredCityOptions}
            value={selectedCity}
            onChange={(value) => {
              setSelectedCity(value);
              setSearchTerm(""); // Clear search when city is selected
              // Navigate to the city's inventory
              if (selectedProject && value) {
                handleCitySelection(value, selectedProject);
              }
            }}
            placeholder={t("select-city")}
            width="347px"
            height="300px"
            t={t}
            label={t("city")}
          />
          <Box w="full" display="flex" justifyContent="flex-start">
            <Button
              variant="ghost"
              onClick={() => {
                router.push(`/onboarding/setup?project=${selectedProject}`);
              }}
              rounded={0}
              w="full"
              h="48px"
              display="flex"
              justifyContent="flex-start"
              textTransform="capitalize"
              px={0}
              ml={-1}
              fontWeight="normal"
              fontFamily="body"
            >
              <Icon as={MdAdd} color={"content.secondary"} boxSize={6} />
              <Text fontSize="body.lg" color="content.secondary">
                {t("add-new-city")}
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
  const { data: projectsData, isLoading } = useGetUserProjectsQuery({});

  const [selectedProject, setSelectedProject] = React.useState<string | null>();
  const [selectedCity, setSelectedCity] = React.useState<string>("");

  // Module data fetching
  const { data: allModules, isLoading: isAllModulesLoading } =
    useGetModulesQuery();
  const { data: projectModules, isLoading: isProjectModulesLoading } =
    useGetProjectModulesQuery(selectedProject!, { skip: !selectedProject });

  // Initialize with current project and city based on currentInventoryId
  useEffect(() => {
    if (currentInventoryId && projectsData) {
      // Find the project and city that contains the current inventory
      for (const project of projectsData) {
        for (const city of project.cities) {
          if (
            city.inventories?.some(
              (inv) => inv.inventoryId === currentInventoryId,
            )
          ) {
            setSelectedProject(project.projectId);
            setSelectedCity(city.cityId);
            return;
          }
        }
      }
    }
  }, [currentInventoryId, projectsData]);

  const selectProject = (projectId: string) => {
    setSelectedProject(projectId);
  };

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

  const selectedProjectData = useMemo<ProjectWithCities | null>(() => {
    if (!selectedProject) return null;

    return (
      projectsData?.find((project) => project.projectId === selectedProject) ||
      null
    );
  }, [projectsData, selectedProject]);

  console.log(projectsData);

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
        h="calc(100vh - 100px)"
        my="auto"
      >
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

          {/* Project / City Filter Section*/}
          {!isLoading && projectsData && (
            <ProjectFilterSection
              t={t}
              projectsData={projectsData}
              lng={lng}
              currentInventoryId={currentInventoryId}
            />
          )}
          <Box w="full" border="1px solid" borderColor="border.neutral" />
          {/* Menu items */}
          <NavigationLinks
            items={[
              {
                label: "home",
                icon: BiHomeAlt,
                href: `/${lng}/cities/${selectedCity}`,
              },
              {
                label: "dashboard",
                icon: BiSolidBarChartAlt2,
                href: `/#`,
              },
              {
                label: "all-projects",
                icon: LuLayoutGrid,
                href: `/${lng}/organization/${organizationId}/projects`,
              },
            ]}
            t={t}
          />
          <Box w="full" border="1px solid" borderColor="border.neutral" />
          {/* Dynamic Module Accordions - based on HomePage logic */}
          {modulesByStage && projectModules && selectedProject && (
            <>
              {[
                {
                  stage: StageNames["Assess And Analyze"],
                  title: "Analyse and Assess",
                  icon: CgEye,
                },
                { stage: StageNames.Plan, title: "Plan", icon: PlanIcon },
                {
                  stage: StageNames.Implement,
                  title: "Implement",
                  icon: BiArrowToRight,
                },
                {
                  stage: StageNames["Monitor, Evaluate & Report"],
                  title: "Monitor, Evaluate & Report",
                  icon: IoMdEye,
                },
              ].map(({ stage, title, icon }) => {
                const modules = projectModules.filter(
                  (mod) => mod.stage === stage,
                );

                if (modules.length === 0) return null;

                return (
                  <NavigationAccordion
                    key={stage}
                    title={title}
                    icon={icon}
                    items={modules.map((mod) => ({
                      label:
                        mod.name.en ||
                        mod.name[Object.keys(mod.name)[0]] ||
                        mod.id,
                      href: `/${lng}/cities/${selectedCity}${mod.url}`,
                    }))}
                    t={t}
                  />
                );
              })}
            </>
          )}
        </DrawerBody>
      </DrawerContent>
    </DrawerRoot>
  );
};

export default JNDrawer;
