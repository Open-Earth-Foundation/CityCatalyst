import { TFunction } from "i18next";
import {
  OrganizationResponse,
  OrganizationRole,
  ProjectUserResponse,
  ProjectWithCities,
} from "@/util/types";
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import { useMemo } from "react";
import { Text } from "@chakra-ui/react";
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
    return projectData?.find(
      (project) => project.projectId === selectedProject,
    );
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
  }, [user, selectedCity, selectedProject]);

  const userName = user?.name?.trim() || user?.email.split("@")[0] || "";

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

  const renderModalText = (scenario: DeleteScenario) => {
    switch (scenario) {
      case DeleteScenario.PROJECT:
        return (
          <Trans
            i18nKey="confirm-remove-project-user"
            t={t}
            values={{
              userName,
              projectName: selectedProjectData?.name,
            }}
            components={{
              bold: (
                <Text
                  as="span"
                  fontWeight="semibold"
                  color="content.primary"
                />
              ),
            }}
          />
        );
      case DeleteScenario.CITY:
        return (
          <Trans
            i18nKey="confirm-remove-city-user"
            t={t}
            values={{
              userName,
              cityName: selectedCityData?.name,
              projectName: selectedProjectData?.name,
            }}
            components={{
              bold: (
                <Text
                  as="span"
                  fontWeight="semibold"
                  color="content.primary"
                />
              ),
            }}
          />
        );
      case DeleteScenario.ORG_ADMIN:
        return (
          <Trans
            i18nKey="confirm-org-admin-delete"
            t={t}
            values={{
              userName,
              orgName: organization?.name,
            }}
            components={{
              bold: (
                <Text
                  as="span"
                  fontWeight="semibold"
                  color="content.primary"
                />
              ),
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
      onOpenChange={(e) => {
        onOpenChange(e.open);
        if (!e.open) {
          onClose();
        }
      }}
      onExitComplete={onClose}
      placement="center"
    >
      <DialogContent minW="568px" borderRadius="6px">
        <DialogHeader
          display="flex"
          justifyContent="start"
          fontWeight="semibold"
          fontSize="title.lg"
          fontFamily="heading"
          lineHeight="32px"
          color="content.primary"
          padding="24px"
          paddingBottom="16px"
        >
          {t("remove-member-title")}
        </DialogHeader>
        <DialogCloseTrigger
          mt="2"
          color="interactive.control"
          top="-6px"
          right="0px"
        />
        <DialogBody paddingX="24px" paddingBottom="24px" paddingTop="0">
          <Text fontSize="body.lg" color="content.tertiary" lineHeight="24px">
            {renderModalText(deleteScenarioData)}
          </Text>
        </DialogBody>
        <DialogFooter
          paddingX="24px"
          paddingY="24px"
          paddingTop="0"
          display="flex"
          justifyContent="flex-end"
          gap="16px"
        >
          <Button
            variant="ghost"
            h="48px"
            minW="120px"
            onClick={onClose}
            textTransform="uppercase"
            letterSpacing="wider"
            fontWeight="semibold"
            fontSize="button.md"
            color="content.secondary"
          >
            {t("cancel")}
          </Button>
          <Button
            variant="solid"
            h="48px"
            minW="200px"
            onClick={handleRemoveFunction}
            loading={isLoading}
            textTransform="uppercase"
            letterSpacing="wider"
            fontWeight="semibold"
            fontSize="button.md"
            backgroundColor="sentiment.negativeDefault"
            color="base.light"
          >
            {t("remove-user")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default RemoveUserModal;
