import { TFunction } from "i18next";
import {
  ListOrganizationsResponse,
  OrganizationResponse,
  OrganizationRole,
  ProjectUserResponse,
  ProjectWithCities,
  ProjectWithCitiesResponse,
} from "@/util/types";
import {
  DialogBackdrop,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import React, { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Flex,
  HStack,
  Icon,
  IconButton,
  Text,
} from "@chakra-ui/react";
import { FiTrash2 } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { api, useTransferCitiesMutation } from "@/services/api";
import { Trans } from "react-i18next/TransWithoutContext";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import { MdCheck, MdKeyboardArrowRight } from "react-icons/md";
import SearchInput from "@/components/SearchInput";

interface MoveCityModalProps {
  isOpen: boolean;
  onOpenChange: (val: boolean) => void;
  closeFunction: () => void;
  t: TFunction;
  organizationData: ListOrganizationsResponse[] | undefined;
  selectedCityIds: string[];
  clearSelections: () => void;
}

const OrganizationList = ({
  t,
  data,
  selectOrganization,
}: {
  t: Function;
  data: ListOrganizationsResponse[] | undefined;
  selectOrganization: (organizationId: string) => void;
}) => {
  const [searchTerm, setSearchTerm] = React.useState("");

  const filteredOrganizationList = useMemo(() => {
    if (!searchTerm) return data;

    return data?.filter((organization) =>
      organization.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [data, searchTerm]);

  return (
    <HStack w="full" flexDirection="column" alignItems="start" gap={6}>
      <Text
        fontSize="title.md"
        className="capitalize"
        fontWeight="semibold"
        color="content.tertiary"
      >
        {t("organizations")}
      </Text>
      <SearchInput searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
      <Box w="full" className="overflow-scroll">
        {filteredOrganizationList?.map((org) => (
          <Button
            variant="ghost"
            rounded={0}
            className="flex justify-between"
            w="full"
            key={org.organizationId}
            onClick={() => selectOrganization(org.organizationId)}
          >
            <Text
              textTransform="capitalize"
              fontSize="body.lg"
              fontWeight="regular"
              color="content.primary"
            >
              {org.name}
            </Text>
            <Icon color="content.primary" as={MdKeyboardArrowRight} />
          </Button>
        ))}
      </Box>
    </HStack>
  );
};

const ProjectListStep = ({
  t,
  data,
  selectProject,
  selectedProjectId,
  clearSelectedOrganization,
}: {
  t: TFunction;
  data: ListOrganizationsResponse | null | undefined;
  selectProject: (projectId: string | null) => void;
  clearSelectedOrganization: () => void;
  selectedProjectId: string | null;
}) => {
  const [searchTerm, setSearchTerm] = React.useState("");
  const filteredOrganizationList = useMemo(() => {
    if (!searchTerm) return data?.projects;

    return data?.projects?.filter((project) =>
      project.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [data, searchTerm]);

  return (
    <HStack w="full" flexDirection="column" alignItems="start" gap={6}>
      <Flex justifyContent="space-between" alignItems="center" gap={1}>
        <Button
          variant="ghost"
          rounded={0}
          className="flex gap-2 justify-start"
          w="full"
          onClick={() => {
            clearSelectedOrganization();
            selectProject(null);
          }}
        >
          <Icon
            color="content.primary"
            rotate="180deg"
            as={MdKeyboardArrowRight}
          />
          <Text
            fontSize="title.md"
            className="capitalize"
            fontWeight="semibold"
            color="content.tertiary"
          >
            {t("projects")}
          </Text>
        </Button>
      </Flex>
      <SearchInput searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
      <Box w="full" className="overflow-scroll">
        {filteredOrganizationList?.length === 0 && (
          <Text color="content.tertiary" fontSize="body.lg">
            {t("no-data")}
          </Text>
        )}
        {filteredOrganizationList?.map((project) => (
          <Button
            variant="ghost"
            rounded={0}
            className="flex justify-between"
            w="full"
            key={project.projectId}
            onClick={() => selectProject(project.projectId)}
          >
            <Text
              textTransform="capitalize"
              fontSize="body.lg"
              fontWeight="regular"
              color="content.primary"
            >
              {project.name}
            </Text>
            {project.projectId === selectedProjectId && (
              <Icon color="interactive.secondary" as={MdCheck} />
            )}
          </Button>
        ))}
      </Box>
    </HStack>
  );
};

const MoveCityModal = (props: MoveCityModalProps) => {
  const {
    isOpen,
    onOpenChange,
    closeFunction,
    t,
    organizationData,
    selectedCityIds,
    clearSelections,
  } = props;

  const { showErrorToast } = UseErrorToast({
    title: t("city-transfer-error"),
  });
  const { showSuccessToast } = UseSuccessToast({
    title: t("cities-successfully moved"),
    duration: 1200,
  });

  const [selectedOrganization, setSelectedOrganization] = useState<
    string | null
  >(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const selectedOrganizationData = useMemo(() => {
    if (!selectedOrganization) return null;
    return organizationData?.find(
      (org) => org.organizationId === selectedOrganization,
    );
  }, [selectedOrganization, organizationData]);

  const [transferCity, { isLoading: isTransferCityLoading }] =
    useTransferCitiesMutation({});

  const closeModalActions = () => {
    setSelectedOrganization(null);
    setSelectedProject(null);
    closeFunction();
  };

  const moveCities = () => {
    if (
      !selectedCityIds ||
      selectedCityIds.length === 0 ||
      !selectedCityIds.length
    )
      return;

    transferCity({
      projectId: selectedProject || "",
      cityIds: selectedCityIds,
    })
      .unwrap()
      .then(() => {
        showSuccessToast();
        closeModalActions();
        clearSelections();
      })
      .catch((error) => {
        console.error(error, "the error");
        showErrorToast({
          title: t("city-transfer-error"),
          description: t(error?.data?.error?.message),
        });
      });
  };

  return (
    <DialogRoot
      preventScroll
      open={isOpen}
      onOpenChange={(e: any) => {
        onOpenChange(e.open);
      }}
      onExitComplete={closeModalActions}
    >
      <DialogBackdrop />
      <DialogContent minH="300px" minW="600px" marginTop="2%">
        <DialogHeader
          display="flex"
          justifyContent="left"
          fontWeight="semibold"
          fontSize="headline.sm"
          fontFamily="heading"
          lineHeight="32"
          color="base.dark"
          padding="24px"
          borderBottomWidth="2px"
          borderStyle="solid"
          borderColor="background.neutral"
        >
          {t("move-selected-cities-to")}
        </DialogHeader>
        <DialogCloseTrigger mt={"2"} color="interactive.control" mr={"2"} />
        <HStack flexDirection="column" alignItems="center" padding={10}>
          {selectedOrganizationData ? (
            <ProjectListStep
              t={t}
              clearSelectedOrganization={() => {
                setSelectedOrganization(null);
                setSelectedProject(null);
              }}
              data={selectedOrganizationData}
              selectProject={setSelectedProject}
              selectedProjectId={selectedProject}
            />
          ) : (
            <OrganizationList
              t={t}
              data={organizationData}
              selectOrganization={setSelectedOrganization}
            />
          )}
        </HStack>
        <DialogFooter
          paddingX={6}
          paddingY={6}
          borderTop="2px"
          borderColor="background.neutral"
          borderStyle="solid"
        >
          <Flex gap={6}>
            <Button
              onClick={closeModalActions}
              w="200px"
              h="64px"
              variant="outline"
            >
              {t("cancel")}
            </Button>
            <Button
              variant="solid"
              disabled={!selectedProject}
              h="64px"
              w="200px"
              loading={isTransferCityLoading}
              onClick={() => moveCities()}
              marginRight="2"
            >
              {t("move")}
            </Button>
          </Flex>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default MoveCityModal;
