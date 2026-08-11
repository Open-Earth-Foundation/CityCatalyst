"use client";
import {
  Accordion,
  Box,
  Button,
  Heading,
  Icon,
  IconButton,
  Table,
  Tabs,
  Text,
} from "@chakra-ui/react";
import {
  MdLink,
  MdMoreVert,
  MdOutlinePerson,
  MdOutlinePersonAddAlt,
} from "react-icons/md";
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";
import { AccordionItemContent } from "@/components/ui/accordion";
import { LuChevronDown } from "react-icons/lu";
import DataTableAlt from "@/components/ui/data-table-alt";
import {
  InviteStatus,
  OrganizationRole,
  ProjectUserResponse,
  ProjectWithCities,
  UserRole,
} from "@/util/types";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import { RiDeleteBin6Line } from "react-icons/ri";
import AddCollaboratorsModal from "@/components/GHGIHomePage/AddCollaboratorModal/AddCollaboratorsModal";
import { uniqBy } from "lodash";
import RemoveUserModal from "@/app/[lng]/admin/organization/[id]/team/RemoveUserModal";
import UpgradeToAdminModal from "./UpgradeToAdminModal";
import { useSession } from "next-auth/react";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import ProjectSearchInput from "../ProjectSearchInput";
import { TFunction } from "i18next";
import { toaster } from "@/components/ui/toaster";
import { copyInviteUrlsToClipboard } from "@/util/copy-invite-urls";
import { UseErrorToast } from "@/hooks/Toasts";

const TeamSettings = ({
  lng,
  initialProjectId,
  initialCityId,
}: {
  lng: string;
  initialProjectId?: string | null;
  initialCityId?: string | null;
}) => {
  const { t } = useTranslation(lng, "settings");

  const TagMapping = {
    [OrganizationRole.ORG_ADMIN]: {
      color: "blue",
      text: t("owner"),
    },
    [OrganizationRole.ADMIN]: {
      color: "blue",
      text: t("admin"),
    },
    [OrganizationRole.COLLABORATOR]: {
      color: "yellow",
      text: t("collaborator"),
    },
  };

  const { organization: orgContext } = useOrganizationContext();
  const selectedOrganization = orgContext?.organizationId;
  const [selectedProject, setSelectedProject] = React.useState<string[]>(
    initialProjectId ? [initialProjectId] : [],
  );
  const [selectedCity, setSelectedCity] = React.useState<string | null>(
    initialCityId ?? "",
  );
  const [projectSearchTerm, setProjectSearchTerm] = useState("");
  const sessionData = useSession();
  const { userRole } = useUserPermissions({
    organizationId: selectedOrganization,
    skip: !selectedOrganization,
  });
  const canManageTeam = userRole === UserRole.ORG_ADMIN;

  const { data: organization, isLoading: isOrganizationLoading } =
    api.useGetOrganizationQuery(selectedOrganization!, {
      skip: !selectedOrganization,
    });

  const { data: projectsData, isLoading } = api.useGetProjectsQuery(
    {
      organizationId: selectedOrganization!,
    },
    {
      skip: !selectedOrganization,
    },
  );

  const { data: projectUsers, isLoading: isLoadingProjectUsers } =
    api.useGetProjectUsersQuery(
      selectedProject.length > 0 ? selectedProject[0] : "",
      {
        skip: !(selectedProject.length > 0),
      },
    );

  const [inviteUsers] = api.useInviteUsersMutation();
  const [createOrganizationInvite] = api.useCreateOrganizationInviteMutation();
  const { showErrorToast } = UseErrorToast({
    title: t("invite-error-toast-title"),
  });

  const userList = useMemo(() => {
    if (!projectUsers) return [];
    if (selectedCity) {
      return projectUsers
        .filter(
          (user) =>
            user.cityId === selectedCity ||
            user.role === OrganizationRole.ORG_ADMIN ||
            user.role === OrganizationRole.ADMIN,
        )
        .map((user) => ({
          ...user,
          role: user.role,
        }));
    }
    return uniqBy(projectUsers, "email");
  }, [projectUsers, selectedCity]);

  useEffect(() => {
    if (
      projectsData &&
      projectsData.length > 0 &&
      selectedProject.length === 0
    ) {
      setSelectedProject([projectsData[0].projectId]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectsData]);

  const copyInviteLink = async (item: ProjectUserResponse) => {
    if (!selectedOrganization) return;
    toaster.create({
      title: t("sending-invite"),
      type: "info",
    });
    try {
      if (item.role === OrganizationRole.ORG_ADMIN) {
        const inviteResponse = await createOrganizationInvite({
          organizationId: selectedOrganization,
          inviteeEmails: [item.email],
          role: OrganizationRole.ORG_ADMIN,
        }).unwrap();
        await copyInviteUrlsToClipboard(inviteResponse.inviteUrls);
      } else {
        const cityIds = [
          ...new Set(
            (projectUsers ?? [])
              .filter((user) => user.email === item.email && user.cityId)
              .map((user) => user.cityId as string),
          ),
        ];
        if (!selectedProject[0] || cityIds.length === 0) {
          throw new Error("Missing project or city for invite");
        }
        const inviteResponse = await inviteUsers({
          projectId: selectedProject[0],
          cityIds,
          invites: [
            {
              email: item.email,
              role:
                item.role === OrganizationRole.ADMIN
                  ? "admin"
                  : "collaborator",
            },
          ],
        }).unwrap();
        await copyInviteUrlsToClipboard(inviteResponse.inviteUrls);
      }
      toaster.dismiss();
      toaster.create({
        title: t("invite-sent-success"),
        description: t("invite-link-copied-to-clipboard"),
        type: "success",
        duration: 3000,
      });
    } catch {
      toaster.dismiss();
      showErrorToast();
    }
  };

  const filteredProjectsData = useMemo(() => {
    if (!projectsData) return [];
    const query = projectSearchTerm.trim().toLowerCase();
    if (!query) return projectsData;

    return projectsData.filter((project) =>
      project.name.toLowerCase().includes(query),
    );
  }, [projectsData, projectSearchTerm]);

  const selectedProjectData = useMemo(() => {
    return projectsData?.find(
      (project) => project.projectId === selectedProject[0],
    );
  }, [projectsData, selectedProject]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [userToRemove, setUserToRemove] = useState<ProjectUserResponse | null>(
    null,
  );
  const [userToUpgrade, setUserToUpgrade] =
    useState<ProjectUserResponse | null>(null);
  if (isOrganizationLoading || isLoading) {
    return <ProgressLoader />;
  }

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
            {t("teams")}
          </Heading>
          <Text color="content.tertiary" fontSize="body.lg" fontFamily="body">
            {t("teams-description")}
          </Text>
        </Box>
        <Button
          onClick={() => {
            setIsModalOpen(true);
          }}
          h="48px"
          mt="auto"
        >
          <Icon as={MdOutlinePersonAddAlt} h={6} w={6} />
          {t("invite-team-member")}
        </Button>
      </Box>
      {projectsData?.length === 0 && (
        <Text
          mt={12}
          fontSize="body.lg"
          fontWeight={600}
          color="content.primary"
        >
          {t("no-data")}
        </Text>
      )}
      <Box
        display="flex"
        gap="48px"
        mt={12}
        alignItems="flex-start"
        borderWidth="1px"
        borderColor="border.overlay"
        borderRadius="8px"
        p="16px"
      >
        <Box
          w="271px"
          overflowY="hidden"
          display="flex"
          flexDirection="column"
          gap="24px"
          h="500px"
        >
          <Text
            fontSize="title.md"
            fontWeight="semibold"
            color="content.secondary"
          >
            {t("projects")}
          </Text>
          <ProjectSearchInput
            value={projectSearchTerm}
            onChange={setProjectSearchTerm}
            t={t}
          />
          <Accordion.Root
            variant="plain"
            value={selectedProject}
            onValueChange={(val) => {
              setSelectedProject(val.value);
              setSelectedCity(null);
            }}
            borderWidth="1px"
            borderColor="border.overlay"
            p="12px"
            w="full"
            h="400px"
            overflowY="scroll"
          >
            {filteredProjectsData.length === 0 && (
              <Text
                fontSize="body.md"
                fontWeight="medium"
                color="content.tertiary"
                p={4}
              >
                {t("no-data")}
              </Text>
            )}
            {filteredProjectsData.map((item) => (
              <Accordion.Item key={item.projectId} value={item.projectId}>
                <Accordion.ItemTrigger
                  onClick={() => {
                    setSelectedCity(null);
                  }}
                  w="full"
                  padding="0px"
                  asChild
                >
                  <Button
                    rounded={0}
                    variant="plain"
                    display="flex"
                    justifyContent="space-between"
                    w="full"
                    minH="56px"
                    p={4}
                    pr={0}
                    alignItems="center"
                    color={
                      selectedProject.includes(item.projectId)
                        ? "interactive.secondary"
                        : "content.secondary"
                    }
                  >
                    <Text
                      fontSize="label.lg"
                      fontWeight="semibold"
                      color="currentcolor"
                    >
                      {item.name}
                    </Text>
                    <Accordion.ItemIndicator
                      color="currentColor"
                      rotate={{ base: "-90deg", _open: "-180deg" }}
                      mr="24px"
                    >
                      <Icon
                        as={LuChevronDown}
                        color="currentColor"
                        boxSize={4}
                      />
                    </Accordion.ItemIndicator>
                  </Button>
                </Accordion.ItemTrigger>
                <AccordionItemContent padding="0px" pb={4}>
                  {item.cities.length === 0 && (
                    <Text
                      fontSize="body.lg"
                      fontWeight={600}
                      color="content.primary"
                    >
                      {t("no-cities")}
                    </Text>
                  )}
                  {item.cities.length > 0 && (
                    <Tabs.Root
                      display="flex"
                      mt="12px"
                      flexDirection="row"
                      variant="subtle"
                      w="full"
                      gap="12px"
                      value={selectedCity}
                      onValueChange={(val) => setSelectedCity(val.value)}
                    >
                      <Tabs.List
                        w="full"
                        display="flex"
                        flexDirection="column"
                        gap="12px"
                      >
                        {item.cities.map((city) => (
                          <Tabs.Trigger
                            key={city.cityId}
                            value={city.cityId}
                            fontFamily="body"
                            justifyContent={"left"}
                            letterSpacing={"wide"}
                            color="content.secondary"
                            lineHeight="20px"
                            fontStyle="normal"
                            fontSize="body.md"
                            fontWeight="medium"
                            minH="52px"
                            w="full"
                            _selected={{
                              color: "content.link",
                              fontSize: "body.md",
                              fontWeight: "medium",
                              backgroundColor: "background.neutral",
                              borderRadius: "8px",
                              borderWidth: "1px",
                              borderStyle: "solid",
                              borderColor: "content.link",
                            }}
                          >
                            {city.name}
                          </Tabs.Trigger>
                        ))}
                      </Tabs.List>
                    </Tabs.Root>
                  )}
                </AccordionItemContent>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        </Box>
        <Box w="723px">
          {isLoadingProjectUsers ? (
            <ProgressLoader />
          ) : (
            <DataTableAlt
              data={userList}
              searchable={true}
              pagination={true}
              itemsPerPage={50}
              searchPlaceholder={t("search-by-name-or-email")}
              filterOptions={Object.keys(TagMapping).map((item) => ({
                value: item,
                label: TagMapping[item as OrganizationRole].text,
              }))}
              filterProperty={"role"}
              title={t("collaborators")}
              columns={[
                { header: t("name"), accessor: "name", width: "30%" },
                { header: t("email"), accessor: "email", width: "35%" },
                { header: t("role"), accessor: "role", width: "20%" },
                { header: "", accessor: null, width: "15%" },
              ]}
              renderRow={(item, idx) => {
                const displayName =
                  item.name?.trim() || item.email.split("@")[0] || "—";

                return (
                  <Table.Row key={idx} fontFamily="body">
                    <Table.Cell maxW="0" title={displayName}>
                      <Text truncate color="content.primary" fontSize="body.md">
                        {displayName}
                      </Text>
                    </Table.Cell>
                    <Table.Cell maxW="0" title={item.email}>
                      <Text truncate color="content.primary" fontSize="body.md">
                        {item.email}
                      </Text>
                    </Table.Cell>
                    <Table.Cell title={item.role}>
                      <CustomTag role={item.role} t={t} />
                    </Table.Cell>
                    <Table.Cell textAlign="right">
                      {canManageTeam &&
                        sessionData.data?.user.email !== item.email && (
                          <MenuRoot>
                            <MenuTrigger asChild>
                              <IconButton
                                data-testid="activity-more-icon"
                                aria-label="more-icon"
                                variant="ghost"
                                color="content.tertiary"
                                _hover={{ bg: "background.controlHover" }}
                                _expanded={{ bg: "background.controlHover" }}
                              >
                                <Icon as={MdMoreVert} size="lg" />
                              </IconButton>
                            </MenuTrigger>
                            <MenuContent
                              w="auto"
                              borderRadius="8px"
                              shadow="2dp"
                              px="0"
                            >
                              {item.status !== InviteStatus.ACCEPTED && (
                                <MenuItem
                                  value={t("copy-invite-link")}
                                  valueText={t("copy-invite-link")}
                                  p="16px"
                                  display="flex"
                                  alignItems="center"
                                  gap="16px"
                                  _hover={{
                                    bg: "content.link",
                                    cursor: "pointer",
                                  }}
                                  className="group"
                                  onClick={() => copyInviteLink(item)}
                                >
                                  <Icon
                                    as={MdLink}
                                    h="24px"
                                    w="24px"
                                    color="content.secondary"
                                    _groupHover={{
                                      color: "white",
                                    }}
                                  />
                                  <Text
                                    color="content.primary"
                                    _groupHover={{
                                      color: "white",
                                    }}
                                  >
                                    {t("copy-invite-link")}
                                  </Text>
                                </MenuItem>
                              )}
                              {item.role === OrganizationRole.COLLABORATOR && (
                                <MenuItem
                                  value={t("upgrade-to-admin")}
                                  valueText={t("upgrade-to-admin")}
                                  p="16px"
                                  display="flex"
                                  alignItems="center"
                                  gap="16px"
                                  _hover={{
                                    bg: "content.link",
                                    cursor: "pointer",
                                  }}
                                  className="group"
                                  onClick={() => {
                                    setIsUpgradeModalOpen(true);
                                    setUserToUpgrade(item);
                                  }}
                                >
                                  <Icon
                                    as={MdOutlinePerson}
                                    h="24px"
                                    w="24px"
                                    color="content.secondary"
                                    _groupHover={{
                                      color: "white",
                                    }}
                                  />
                                  <Text
                                    color="content.primary"
                                    _groupHover={{
                                      color: "white",
                                    }}
                                  >
                                    {t("upgrade-to-admin")}
                                  </Text>
                                </MenuItem>
                              )}
                              <MenuItem
                                value={t("remove-user")}
                                valueText={t("remove-user")}
                                p="16px"
                                display="flex"
                                alignItems="center"
                                gap="16px"
                                _hover={{
                                  bg: "content.link",
                                  cursor: "pointer",
                                }}
                                className="group"
                                onClick={() => {
                                  setIsDeleteModalOpen(true);
                                  setUserToRemove(item);
                                }}
                              >
                                <Icon
                                  color="sentiment.negativeDefault"
                                  as={RiDeleteBin6Line}
                                  h="24px"
                                  w="24px"
                                  _groupHover={{
                                    color: "white",
                                  }}
                                />
                                <Text
                                  color="content.primary"
                                  _groupHover={{
                                    color: "white",
                                  }}
                                >
                                  {t("remove-user")}
                                </Text>
                              </MenuItem>
                            </MenuContent>
                          </MenuRoot>
                        )}
                    </Table.Cell>
                  </Table.Row>
                );
              }}
            />
          )}
        </Box>
      </Box>
      <AddCollaboratorsModal
        lng={lng}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        organizationId={selectedOrganization}
      />
      <RemoveUserModal
        t={t}
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setUserToRemove(null);
        }}
        onOpenChange={setIsDeleteModalOpen}
        projectData={projectsData as ProjectWithCities[]}
        selectedProject={selectedProject.length > 0 ? selectedProject[0] : null}
        selectedCity={selectedCity}
        user={userToRemove}
        organization={organization}
      />
      <UpgradeToAdminModal
        t={t}
        isOpen={isUpgradeModalOpen}
        onClose={() => {
          setIsUpgradeModalOpen(false);
          setUserToUpgrade(null);
        }}
        onOpenChange={setIsUpgradeModalOpen}
        user={userToUpgrade}
        organizationId={selectedOrganization}
        projectName={selectedProjectData?.name}
      />
    </Box>
  );
};

export const SettingsTagMapping = {
  [OrganizationRole.ORG_ADMIN]: { text: "owner" },
  [OrganizationRole.ADMIN]: { text: "admin" },
  [OrganizationRole.COLLABORATOR]: { color: "yellow", text: "collaborator" },
};

const CustomTag = ({ role, t }: { role: OrganizationRole; t: TFunction }) => {
  const text = SettingsTagMapping[role].text;
  return (
    <Box
      bg="background.neutral"
      p="4px"
      w="fit-content"
      px="16px"
      borderWidth="1px"
      borderColor="content.alternative"
      display="flex"
      alignItems="center"
      justifyContent="center"
      borderRadius="30px"
    >
      <Text
        color="content.alternative"
        fontSize="body.md"
        fontWeight="medium"
        fontFamily="body"
      >
        {t(text)}
      </Text>
    </Box>
  );
};

export default TeamSettings;
