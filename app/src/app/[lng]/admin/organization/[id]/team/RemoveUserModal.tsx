import { TFunction } from "i18next";
import {
  OrganizationResponse,
  OrganizationRole,
  ProjectUserResponse,
  ProjectWithCities,
} from "@/util/types";
import {
  DialogBackdrop,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import React, { useMemo } from "react";
import { Badge, HStack, Text } from "@chakra-ui/react";
import { FiTrash2 } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api";
import { Trans } from "react-i18next/TransWithoutContext";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";

interface RemoveUserModalProps {
  projectData: ProjectWithCities[];
  selectedProject: string | null;
  selectedCity: string | null;
  isOpen: boolean;
  onClose: () => void;
  t: TFunction;
  onOpenChange: (val: boolean) => void;
  user: ProjectUserResponse | null;
  organization: OrganizationResponse | undefined;
}

enum DeleteScenario {
  PROJECT = 1,
  CITY = 2,
  ORG_ADMIN = 3,
}

const RemoveUserModal = (props: RemoveUserModalProps) => {
  const {
    projectData,
    selectedProject,
    selectedCity,
    onClose,
    t,
    isOpen,
    onOpenChange,
    user,
    organization,
  } = props;

  const { showErrorToast } = UseErrorToast({
    title: t("error-message"),
  });
  const { showSuccessToast } = UseSuccessToast({
    title: t("user-removed"),
    duration: 1200,
  });

  const [deleteProjectUser, { isLoading: isDeletingProjectUser }] =
    api.useDeleteProjectUserMutation();
  const [deleteCityUser, { isLoading: isDeletingCityUser }] =
    api.useDeleteCityUserMutation();
  const [deleteOrgAdmin, { isLoading: isDeletingOrgAdmin }] =
    api.useDeleteOrganizationAdminUserMutation();

  const isLoading =
    isDeletingProjectUser || isDeletingCityUser || isDeletingOrgAdmin;

  const selectedProjectData = useMemo(() => {
    return projectData.find((project) => project.projectId === selectedProject);
  }, [projectData, selectedProject]);

  const selectedCityData = useMemo(() => {
    return selectedProjectData?.cities.find(
      (city) => city.cityId === selectedCity,
    );
  }, [selectedProjectData, selectedCity]);

  const deleteScenarioData = useMemo<DeleteScenario>(() => {
    if (user?.role === OrganizationRole.ORG_ADMIN) {
      return DeleteScenario.ORG_ADMIN;
    } else if (selectedCity) {
      return DeleteScenario.CITY;
    } else if (selectedProject && !selectedCity) {
      return DeleteScenario.PROJECT;
    }
    return DeleteScenario.PROJECT;
  }, [user, selectedCity, selectedCity, organization]);

  const handleRemoveFunction = async () => {
    let apiPromise;
    if (deleteScenarioData === DeleteScenario.PROJECT) {
      apiPromise = deleteProjectUser({
        projectId: selectedProjectData?.projectId as string,
        email: user?.email as string,
      });
    } else if (deleteScenarioData === DeleteScenario.CITY) {
      apiPromise = deleteCityUser({
        cityId: selectedCityData?.cityId as string,
        email: user?.email as string,
      });
    } else if (deleteScenarioData === DeleteScenario.ORG_ADMIN) {
      apiPromise = deleteOrgAdmin({
        email: user?.email as string,
        organizationId: organization?.organizationId as string,
      });
    }
    const response = await apiPromise;
    if (response?.error) {
      showErrorToast();
      return;
    }
    showSuccessToast();
    onClose();
  };

  const closeFunction = () => {
    onClose();
  };

  const renderModalText = (scenario: DeleteScenario) => {
    switch (scenario) {
      case DeleteScenario.PROJECT:
        return (
          <Trans
            i18nKey="confirm-remove-project-user"
            t={t}
            values={{
              email: user?.email,
              projectName: selectedProjectData?.name,
            }}
            components={{
              bold: <strong />,
            }}
          />
        );
      case DeleteScenario.CITY:
        return (
          <Trans
            i18nKey="confirm-remove-city-user"
            t={t}
            values={{
              email: user?.email,
              cityName: selectedCityData?.name,
              projectName: selectedProjectData?.name,
            }}
            components={{
              bold: <strong />,
            }}
          />
        );
      case DeleteScenario.ORG_ADMIN:
        return (
          <Trans
            i18nKey="confirm-org-admin-delete"
            t={t}
            values={{
              email: user?.email,
              orgName: organization?.name,
            }}
            components={{
              bold: <strong />,
            }}
          />
        );
      default:
        return "";
    }
  };

  return (
    <DialogRoot
      preventScroll
      open={isOpen}
      onOpenChange={(e: any) => {
        onOpenChange(e.open);
      }}
      onExitComplete={closeFunction}
    >
      <DialogBackdrop />
      <DialogContent minH="300px" minW="600px" marginTop="2%">
        <DialogHeader
          display="flex"
          justifyContent="center"
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
          {t("remove-user")}
        </DialogHeader>
        <DialogCloseTrigger mt={"2"} color="interactive.control" mr={"2"} />
        <HStack flexDirection="column" alignItems="center" padding="24px">
          <Badge
            color="sentiment.negativeDefault"
            h="68px"
            w="68px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            borderRadius="full"
            background="sentiment.negativeOverlay"
          >
            <FiTrash2 size={36} />
          </Badge>
          <Text
            w="full"
            maxW="450px"
            textAlign="center"
            mt={6}
            fontSize="body.lg"
          >
            {renderModalText(deleteScenarioData)}
          </Text>
        </HStack>
        <DialogFooter
          paddingX={6}
          paddingY={6}
          borderTop="2px"
          borderColor="background.neutral"
          borderStyle="solid"
        >
          <Button
            variant="solid"
            h="64px"
            w="full"
            onClick={handleRemoveFunction}
            color="base.light"
            backgroundColor="sentiment.negativeDefault"
            marginRight="2"
            loading={isLoading}
          >
            {t("remove-user")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default RemoveUserModal;
