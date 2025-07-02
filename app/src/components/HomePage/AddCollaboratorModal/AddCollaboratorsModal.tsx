import React, { useState, useMemo, useEffect } from "react";
import {
  Box,
  Button,
  CheckboxGroup,
  createListCollection,
  HStack,
  ProgressCircle,
  Separator,
  Text,
} from "@chakra-ui/react";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";
import { MdPersonAdd } from "react-icons/md";
import { TitleLarge } from "@/components/Texts/Title";
import { BodyLarge } from "@/components/Texts/Body";
import { HeadlineSmall } from "@/components/Texts/Headline";
import {
  useCreateOrganizationInviteMutation,
  useGetProjectsQuery,
  useGetUserProjectsQuery,
  useInviteUsersMutation,
} from "@/services/api";
import LabelLarge from "@/components/Texts/Label";
import MultipleEmailInput from "./MultipleEmailInput";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import { useTranslation } from "@/i18n/client";
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  SelectContent,
  SelectItem,
  SelectItemGroup,
  SelectLabel,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "@/components/ui/select";
import Callout from "@/components/ui/callout";
import { OrganizationRole } from "@/util/types";

const AddCollaboratorsDialog = ({
  lng,
  isOpen,
  onClose,
  onOpen,
  organizationId,
  isAdmin,
}: {
  lng: string;
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
  organizationId?: string;
  isAdmin?: boolean;
}) => {
  const { t } = useTranslation(lng, "dashboard");

  const { showSuccessToast } = UseSuccessToast({
    title: t("invite-success-toast-title"),
    description: t("invite-success-toast-description"),
  });

  const { showErrorToast } = UseErrorToast({
    title: t("invite-error-toast-title"),
    description: t("invite-error-toast-description"),
  });

  const { data: projectsData, isLoading } = useGetUserProjectsQuery({});

  const projectCollection = useMemo(() => {
    return createListCollection({
      items:
        projectsData?.map((project) => ({
          label: project.name,
          value: project.projectId,
        })) ?? [],
    });
  }, [projectsData]);

  const [inviteUsers, { isLoading: isInviteUsersLoading }] =
    useInviteUsersMutation();
  const [createOrganizationInvite, { isLoading: isAdminInviteLoading }] =
    useCreateOrganizationInviteMutation();

  const [emails, setEmails] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string[]>([]);
  const [role, setRole] = useState<string>("collaborator");

  useEffect(() => {
    if (role === "admin") {
      setSelectedCities([]);
      setSelectedProject([]);
    }
  }, [role]);

  const handleCityChange = (city: string) => {
    setSelectedCities((prevSelectedCities) =>
      prevSelectedCities.includes(city)
        ? prevSelectedCities.filter((c) => c !== city)
        : [...prevSelectedCities, city],
    );
  };

  const checkAllCities = () => {
    if (selectedCities.length === cityData?.length) {
      setSelectedCities([]);
    } else {
      setSelectedCities(cityData?.map((city) => city.cityId));
    }
  };

  const onSendInvitesClick = async (): Promise<void> => {
    const { data, error } = await inviteUsers({
      cityIds: selectedCities,
      emails,
    });
    if (data?.success && !error) {
      showSuccessToast();
      setEmails([]);
      setSelectedCities([]);
      onClose();
    } else {
      showErrorToast();
    }
  };

  const onAdminInviteClick = async () => {
    const inviteResponse = await createOrganizationInvite({
      organizationId: organizationId as string,
      inviteeEmails: emails,
      role: OrganizationRole.ORG_ADMIN,
    });
    if (inviteResponse.data) {
      showSuccessToast();
      onClose();
    } else {
      showErrorToast();
    }
  };

  const closeFunction = () => {
    setEmails([]);
    setSelectedCities([]);
    setSelectedProject([]);
    onClose();
  };

  const cityData = useMemo<
    {
      cityId: string;
      name: string;
    }[]
  >(() => {
    if (!selectedProject || selectedProject.length === 0) return [];

    const project = projectsData?.find(
      (project) => project.projectId === selectedProject[0],
    );
    return (
      project?.cities.map((city) => ({
        cityId: city.cityId,
        name: city.name,
      })) ?? []
    );
  }, [isAdmin, projectsData, selectedProject]);

  return (
    <DialogRoot
      open={isOpen}
      onOpenChange={closeFunction}
      onExitComplete={onClose}
    >
      <DialogContent minH="300px" minW="600px" marginTop="2%" p={0}>
        <DialogHeader
          display="flex"
          justifyContent="start"
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
          <HStack>
            <MdPersonAdd fontSize={"32px"} />
            <HeadlineSmall text={t("invite-your-colleagues")} />
          </HStack>
        </DialogHeader>
        <DialogCloseTrigger mt={"2"} color="interactive.control" mr={"2"} />
        <DialogBody p={0}>
          <Box paddingX={6} mt={6}>
            <TitleLarge color="content.tertiary">
              {t("choose-a-role")}
            </TitleLarge>
            <LabelLarge text={t("select-role")} mt={3} />
            <NativeSelectRoot
              variant="outline"
              defaultValue="collaborator"
              marginTop={3}
              w={"60%"}
            >
              <NativeSelectField
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                }}
              >
                <option value="collaborator">{t("collaborator")}</option>
                {isAdmin && <option value="admin">{t("admin")}</option>}
              </NativeSelectField>
            </NativeSelectRoot>
            <Callout
              p={4}
              mt={4}
              heading={
                role === "admin" ? t("admin-rule") : t("collaborator-rule")
              }
            />
          </Box>
          <Box paddingX={6} mt={6} mb={role === "admin" ? 20 : 6}>
            <TitleLarge color="content.tertiary">
              {t("send-invites")}
            </TitleLarge>
            <Text color="content.tertiary">
              {t("send-invites-description-1")}
              <br />
              {t("send-invites-description-2")}
            </Text>
            <LabelLarge text={t("email")} mt={3} />
            <MultipleEmailInput t={t} emails={emails} setEmails={setEmails} />
          </Box>
          {role !== "admin" && (
            <Box
              display="flex"
              paddingX={6}
              mt={6}
              flexDirection="column"
              gap={3}
              mb={10}
            >
              <TitleLarge color="content.tertiary">
                {t("project-to-share")}
              </TitleLarge>
              {isLoading ? (
                <ProgressCircle.Root value={null} size="sm">
                  <ProgressCircle.Circle>
                    <ProgressCircle.Track />
                    <ProgressCircle.Range />
                  </ProgressCircle.Circle>
                </ProgressCircle.Root>
              ) : (
                <SelectRoot
                  value={selectedProject}
                  onValueChange={(e) => setSelectedProject(e.value)}
                  variant="subtle"
                  w="80%"
                  collection={projectCollection}
                >
                  <SelectLabel display="flex" alignItems="center" gap="8px">
                    <Text fontFamily="heading" color="content.secondary">
                      {t("project")}
                    </Text>
                  </SelectLabel>
                  <SelectTrigger>
                    <SelectValueText
                      color="content.tertiary"
                      fontWeight="medium"
                      placeholder={t("select-project")}
                    />
                  </SelectTrigger>
                  <SelectContent portalled={false}>
                    {projectCollection?.items.map((project) => (
                      <SelectItem key={project.value} item={project.value}>
                        {project.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectRoot>
              )}
            </Box>
          )}
          {!(selectedProject.length > 0) ? null : (
            <Box paddingX={6}>
              <TitleLarge color="content.tertiary">
                {t("select-cities-to-share")}
              </TitleLarge>
              <BodyLarge>{t("select-cities-to-share-description")}</BodyLarge>
              {cityData?.length === 0 && (
                <Text fontSize="body.md" mt={3} color="content.tertiary">
                  {isAdmin && !selectedProject
                    ? t("select-project")
                    : t("no-cities-available")}
                </Text>
              )}
              <Box>
                {cityData?.length > 1 && (
                  <>
                    <Checkbox
                      key="all"
                      my={6}
                      checked={selectedCities.length === cityData?.length}
                      onChange={() => checkAllCities()}
                    >
                      <Text fontWeight="semibold" fontSize="body.lg">
                        {t("all-cities")}
                      </Text>
                    </Checkbox>
                    <Separator borderColor="border.overlay" />
                  </>
                )}
                <CheckboxGroup my="24px">
                  <Box
                    display="grid"
                    gridTemplateColumns={{
                      base: "1fr",
                      sm: "repeat(2, 1fr)",
                      md: "repeat(3, 1fr)",
                    }}
                    gap={4}
                  >
                    {cityData?.map(({ cityId, name }) => (
                      <Checkbox
                        key={cityId}
                        checked={selectedCities.includes(cityId)}
                        onChange={() => handleCityChange(cityId)}
                      >
                        <Text fontWeight="semibold" fontSize="body.lg">
                          {name}
                        </Text>
                      </Checkbox>
                    ))}
                  </Box>
                </CheckboxGroup>
              </Box>
            </Box>
          )}
          <DialogFooter
            paddingX={6}
            paddingY={6}
            borderTop="2px"
            borderColor="background.neutral"
            borderStyle="solid"
          >
            <Box>
              <Button
                disabled={
                  emails.length === 0 ||
                  (role === "collaborator" && selectedCities.length === 0) ||
                  isInviteUsersLoading ||
                  isAdminInviteLoading
                }
                loading={isInviteUsersLoading || isAdminInviteLoading}
                colorScheme="blue"
                onClick={() =>
                  role === "admin" ? onAdminInviteClick() : onSendInvitesClick()
                }
              >
                {t("send-invites")}
              </Button>
            </Box>
          </DialogFooter>
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  );
};

export default AddCollaboratorsDialog;
