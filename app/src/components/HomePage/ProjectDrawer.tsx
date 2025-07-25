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
import { useRouter } from "next/navigation";
import { FaLocationDot } from "react-icons/fa6";
import { useTranslation } from "@/i18n/client";
import ProjectLimitModal from "@/components/project-limit";
import SearchInput from "@/components/SearchInput";
import { logger } from "@/services/logger";

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
  const goToOnboarding = () => {
    if (
      BigInt(project.cities.length) ===
      BigInt(project.cityCountLimit as unknown as string)
    ) {
      setIsProjectLimitModalOpen(true);
    } else {
      router.push(`/onboarding/setup?project=${project.projectId}`);
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

    router.push(`/${lng}/${inventoryId}`);
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
      <Button
        variant="ghost"
        w="full"
        justifyContent="start"
        onClick={goToOnboarding}
      >
        <Icon as={MdAdd} color={"content.alternative"} boxSize={6} />
        <Text fontSize="body.lg" color="content.primary" fontWeight="normal">
          {t("add-a-new-city")}
        </Text>
      </Button>
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
        t={t as any}
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
  const { data: projectsData, isLoading } = useGetUserProjectsQuery({});

  const [selectedProject, setSelectedProject] = React.useState<string | null>();

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
